import { Amplify } from 'aws-amplify';

const domain = import.meta.env.VITE_COGNITO_DOMAIN;

const oauth = domain
  ? {
      domain,
      scopes: ['openid', 'email', 'profile'],
      redirectSignIn: [window.location.origin + '/'],
      redirectSignOut: [window.location.origin + '/'],
      responseType: 'code',
    }
  : undefined;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      loginWith: oauth ? { oauth } : {},
    },
  },
});

export const SOCIAL_LOGIN_ENABLED = Boolean(domain);
