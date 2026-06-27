# The Freedom Trail 🇺🇸

A website + AWS backend for a 4th of July party game. Guests sign in, work through
your custom **Freedom Trail** challenges, tick them off as they go, and compete on a
live leaderboard.

- **Auth:** Amazon Cognito (email/password + optional Google social login)
- **Database:** DynamoDB (single table)
- **API:** API Gateway (HTTP API) + a single Lambda
- **Frontend:** React (Vite), hosted on S3 + CloudFront
- **Infrastructure:** AWS CDK (one command to deploy)

---

## Repository layout

```
Patriot/
├── infrastructure/     CDK app — all AWS resources
│   ├── bin/freedom-trail.ts
│   └── lib/freedom-trail-stack.ts
├── backend/            Lambda handler (no build step — uses runtime AWS SDK)
│   └── index.js
├── frontend/           React app (Vite)
│   └── src/...
├── scripts/            Seed script to load challenges into DynamoDB
│   └── seed.js
├── seed/challenges.json   Your editable list of challenges
└── README.md
```

## How completion works

Honor system: a signed-in guest taps **Mark complete** on any challenge, and can tap
again to un-mark it if they made a mistake. Points are summed for the leaderboard.

---

## Prerequisites

1. An **AWS account** and the **AWS CLI** configured (`aws configure`) with credentials
   that can create the resources above.
2. **Node.js 18+** and npm.
3. The **AWS CDK CLI** is included as a dev dependency, so `npx cdk ...` works without a
   global install.

> All commands below assume you're in the `Patriot` folder. On Windows use PowerShell.

---

## Step 1 — Deploy the infrastructure

```bash
cd infrastructure
npm install

# One-time per account/region: prepare CDK for deployments
npx cdk bootstrap

# Deploy. Optionally add Google social login (see "Google login" section below).
npx cdk deploy
```

When it finishes, CDK prints an **Outputs** block. Copy these values — you'll need them:

```
FreedomTrailStack.ApiUrl                = https://abc123.execute-api.us-east-1.amazonaws.com
FreedomTrailStack.UserPoolId            = us-east-1_XXXXXXXXX
FreedomTrailStack.UserPoolClientId      = XXXXXXXXXXXXXXXXXXXXXX
FreedomTrailStack.CognitoRegion         = us-east-1
FreedomTrailStack.CognitoHostedUiDomain = freedom-trail-123456789012.auth.us-east-1.amazoncognito.com
FreedomTrailStack.SiteUrl               = https://dxxxxxxxxxxxxx.cloudfront.net
FreedomTrailStack.SiteBucketName        = freedomtrailstack-sitebucket-xxxxxxxx
FreedomTrailStack.DistributionId        = EXXXXXXXXXXXXX
FreedomTrailStack.TableName             = FreedomTrail
```

## Step 2 — Seed the challenges

Edit `seed/challenges.json` to your liking (titles, descriptions, points, order), then:

```bash
cd ../scripts
npm install
TABLE_NAME=FreedomTrail AWS_REGION=us-east-1 node seed.js
```

(On PowerShell: `$env:TABLE_NAME="FreedomTrail"; $env:AWS_REGION="us-east-1"; node seed.js`)

Re-running is safe — it overwrites the same challenge items. To change challenges later,
edit the JSON and run it again.

## Step 3 — Configure & build the frontend

```bash
cd ../frontend
npm install
cp .env.example .env       # PowerShell: copy .env.example .env
```

Open `.env` and fill in the values from the Step 1 outputs:

```
VITE_API_URL=<ApiUrl>
VITE_USER_POOL_ID=<UserPoolId>
VITE_USER_POOL_CLIENT_ID=<UserPoolClientId>
VITE_COGNITO_REGION=<CognitoRegion>
# Only needed if you set up Google login:
VITE_COGNITO_DOMAIN=<CognitoHostedUiDomain>
```

Then build:

```bash
npm run build      # outputs to frontend/dist
```

## Step 4 — Publish the frontend

Upload the built site to the S3 bucket and refresh the CloudFront cache:

```bash
aws s3 sync dist/ s3://<SiteBucketName>/ --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

Open the **SiteUrl** in a browser — you're live. 🎆

---

## Local development

Run the frontend against the deployed backend:

```bash
cd frontend
npm run dev        # http://localhost:5173
```

`http://localhost:5173` is already whitelisted as a Cognito callback URL, so email/password
and Google login both work locally.

---

## Google login (optional)

Email/password works out of the box. To add "Continue with Google":

1. In the [Google Cloud Console](https://console.cloud.google.com/), create an **OAuth 2.0
   Client ID** (type: Web application).
2. Add this **Authorized redirect URI**:
   `https://<CognitoHostedUiDomain>/oauth2/idpresponse`
   (the `CognitoHostedUiDomain` output, prefixed with `https://`).
3. Redeploy the stack with the Google credentials passed as CDK context:

   ```bash
   cd infrastructure
   npx cdk deploy -c googleClientId=YOUR_ID -c googleClientSecret=YOUR_SECRET
   ```

4. Make sure `VITE_COGNITO_DOMAIN` is set in `frontend/.env`, then rebuild & re-sync the
   frontend (Steps 3–4).

> The Cognito Hosted UI domain prefix defaults to `freedom-trail-<accountId>`. If that
> prefix is taken, override it: `npx cdk deploy -c authDomainPrefix=my-unique-prefix`.

---

## Data model (DynamoDB single table `FreedomTrail`)

| Item       | PK              | SK              | Attributes                          |
|------------|-----------------|-----------------|-------------------------------------|
| Challenge  | `CHALLENGE`     | `<challengeId>` | title, description, points, order   |
| Profile    | `USER#<sub>`    | `PROFILE`       | displayName, email, createdAt       |
| Completion | `USER#<sub>`    | `COMP#<id>`     | challengeId, completedAt            |

`<sub>` is the Cognito user id. Profiles are created automatically on a user's first
authenticated request; display names are editable from the Profile page.

## API routes

| Method | Path                            | Auth   | Purpose                        |
|--------|---------------------------------|--------|--------------------------------|
| GET    | `/challenges`                   | public | List all challenges            |
| GET    | `/leaderboard`                  | public | Ranked standings               |
| GET    | `/me`                           | yes    | Get my profile                 |
| PUT    | `/me`                           | yes    | Update my display name         |
| GET    | `/me/completions`               | yes    | My completed challenges        |
| POST   | `/me/completions/{challengeId}` | yes    | Mark complete                  |
| DELETE | `/me/completions/{challengeId}` | yes    | Un-mark complete               |

Authenticated routes expect the Cognito **ID token** in the `Authorization` header (the
frontend handles this automatically).

---

## Tear down

To remove everything and stop incurring any (tiny) costs after the party:

```bash
cd infrastructure
npx cdk destroy
```

The DynamoDB table and S3 bucket are configured to delete with the stack.

## Cost

For a party-sized crowd this runs comfortably in the AWS free tier / pennies: DynamoDB is
on-demand, Lambda + API Gateway are pay-per-request, and CloudFront/S3 costs for a small
static site are negligible.

---

## Challenge types (added)

Every challenge has a `type` and a `history` block (event, year, summary) shown in the
expandable accordion. Edit these in `seed/challenges.json` and re-run the seed script.

- **`honor`** — guest taps **Mark complete**; tap again to un-mark.
- **`trivia`** — guest types an answer; it's checked **server-side** against the
  `answers` array (case/punctuation-insensitive, multiple accepted answers allowed).
  Answers are **never** sent to the browser — the public `/challenges` endpoint strips them.
- **`peer`** — guest taps **Request a witness** (status becomes *pending*). A *different*
  signed-in guest opens the same challenge and taps **Confirm** under "Verify a friend."
  Only then does it count. Pending challenges don't score until verified.

Example seed entries:

```json
{ "challengeId": "liberty-bell-trivia", "type": "trivia", "title": "Let Freedom Ring",
  "description": "Trivia: In which U.S. city can you visit the Liberty Bell?",
  "points": 15, "answers": ["Philadelphia", "Philly"],
  "history": { "event": "The Liberty Bell", "year": "1752", "summary": "..." } }

{ "challengeId": "boston-tea-party", "type": "peer", "title": "The Boston Tea Party",
  "description": "Toss a bean bag into the harbor bucket. A guest must verify your throw.",
  "points": 20,
  "history": { "event": "The Boston Tea Party", "year": "December 16, 1773", "summary": "..." } }
```

> After editing `seed/challenges.json`, re-run the seed script (Step 2) to push changes.

### Additional API routes

| Method | Path                                       | Auth | Purpose                              |
|--------|--------------------------------------------|------|--------------------------------------|
| GET    | `/challenges/{challengeId}/pending`        | yes  | Guests awaiting a witness (peer)     |
| POST   | `/challenges/{challengeId}/verify/{userId}`| yes  | Confirm another guest's completion   |

For trivia, `POST /me/completions/{challengeId}` takes a JSON body `{ "answer": "..." }`.
A wrong answer returns `{ "status": "incomplete", "correct": false }` (HTTP 200).

### Data model note

Completion items now carry a `status` field: `complete` (honor, trivia, verified peer) or
`pending` (peer awaiting a witness). Pending peer items also set `GSI1PK = "PENDING#<id>"`
and `GSI1SK = "USER#<sub>"` so the new **GSI1** index can list who needs verifying; those
attributes are removed once verified. Only `complete` items count on the leaderboard.
# Patriot
