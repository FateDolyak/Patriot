#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FreedomTrailStack } from '../lib/freedom-trail-stack';

const app = new cdk.App();

// Optional social-login + custom-domain configuration can be supplied via
// CDK context, e.g.:
//   cdk deploy -c googleClientId=... -c googleClientSecret=... -c callbackUrl=https://...
new FreedomTrailStack(app, 'FreedomTrailStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'Infrastructure for The Freedom Trail 4th of July party website.',
});
