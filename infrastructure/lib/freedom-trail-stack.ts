import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';

export class FreedomTrailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---- Optional configuration (supply via `cdk deploy -c key=value`) ----
    const googleClientId = this.node.tryGetContext('googleClientId') as string | undefined;
    const googleClientSecret = this.node.tryGetContext('googleClientSecret') as string | undefined;
    const authDomainPrefix =
      (this.node.tryGetContext('authDomainPrefix') as string | undefined) ||
      `freedom-trail-${this.account}`;
    // Extra callback origin for local development.
    const localDevUrl = 'http://localhost:5173';

    // =====================================================================
    // 1. DynamoDB — single-table design
    //    Item shapes:
    //      Challenge:  PK = "CHALLENGE"        SK = <challengeId>
    //      Profile:    PK = "USER#<sub>"       SK = "PROFILE"
    //      Completion: PK = "USER#<sub>"       SK = "COMP#<challengeId>"
    // =====================================================================
    const table = new dynamodb.Table(this, 'FreedomTrailTable', {
      tableName: 'FreedomTrail',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // party app — fine to tear down
    });

    // GSI1 indexes pending peer-verification requests so any guest can look up
    // "who needs a witness for challenge X" efficiently. Only pending peer
    // completions carry GSI1PK/GSI1SK; once verified the attributes are removed
    // and the item drops out of the index.
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // =====================================================================
    // 2. Cognito — email/password + optional Google social login
    // =====================================================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'freedom-trail-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Hosted UI domain (required for social login redirects).
    userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix: authDomainPrefix },
    });

    const supportedIdps: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];

    let googleProvider: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (googleClientId && googleClientSecret) {
      googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdp', {
        userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      supportedIdps.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    // We need the CloudFront domain for OAuth callback URLs, so create the
    // distribution first (it does not depend on Cognito), then the client.
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA routing: serve index.html for client-side routes.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const siteUrl = `https://${distribution.distributionDomainName}`;

    // Allowed return URLs after sign-in / sign-out. We include both the
    // no-slash and trailing-slash forms because Amplify appends a slash to
    // window.location.origin and Cognito matches callback URLs *exactly*.
    // The custom domain is listed too so it works once DNS is pointed at it.
    const callbackUrls = [
      siteUrl,
      `${siteUrl}/`,
      localDevUrl,
      `${localDevUrl}/`,
      'https://patriot.dolyak.com',
      'https://patriot.dolyak.com/',
    ];

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'freedom-trail-web',
      generateSecret: false, // public SPA client
      supportedIdentityProviders: supportedIdps,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: callbackUrls,
        logoutUrls: callbackUrls,
      },
      preventUserExistenceErrors: true,
    });
    if (googleProvider) {
      userPoolClient.node.addDependency(googleProvider);
    }

    // =====================================================================
    // 3. Backend Lambda (single router function) + HTTP API
    // =====================================================================
    const apiFn = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      // No build step: handlers use only the AWS SDK v3 bundled in the runtime.
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'backend')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        ALLOWED_ORIGIN: '*',
      },
    });
    table.grantReadWriteData(apiFn);

    const authorizer = new HttpUserPoolAuthorizer('JwtAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'freedom-trail-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
      },
    });

    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn);

    // Public routes (no auth) — anyone can view challenges and leaderboard.
    httpApi.addRoutes({ path: '/challenges', methods: [HttpMethod.GET], integration });
    httpApi.addRoutes({ path: '/leaderboard', methods: [HttpMethod.GET], integration });

    // Authenticated routes.
    httpApi.addRoutes({ path: '/me', methods: [HttpMethod.GET, HttpMethod.PUT], integration, authorizer });
    httpApi.addRoutes({ path: '/me/completions', methods: [HttpMethod.GET], integration, authorizer });
    httpApi.addRoutes({
      path: '/me/completions/{challengeId}',
      methods: [HttpMethod.POST, HttpMethod.DELETE],
      integration,
      authorizer,
    });
    // Peer verification: list guests awaiting a witness for a challenge, and
    // confirm another guest's completion.
    httpApi.addRoutes({
      path: '/challenges/{challengeId}/pending',
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });
    httpApi.addRoutes({
      path: '/challenges/{challengeId}/verify/{userId}',
      methods: [HttpMethod.POST],
      integration,
      authorizer,
    });

    // =====================================================================
    // 4. Outputs — values needed for frontend config + seeding
    // =====================================================================
    new cdk.CfnOutput(this, 'SiteUrl', { value: siteUrl });
    new cdk.CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoRegion', { value: this.region });
    new cdk.CfnOutput(this, 'CognitoHostedUiDomain', {
      value: `${authDomainPrefix}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
