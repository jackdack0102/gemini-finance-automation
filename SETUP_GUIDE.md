# GitHub to Google Apps Script CI/CD Setup Guide

## Overview
This setup automatically deploys your code to Google Apps Script whenever you push to GitHub.

## Architecture

```
GitHub Push → AWS CodeBuild Webhook → CodeBuild Runs → clasp push → Google Apps Script Updated
```

---

## What's Already Configured

### 1. **buildspec.yml** (Build Instructions)
```yaml
- Installs @google/clasp (Google Apps Script CLI)
- Retrieves auth token from AWS Secrets Manager
- Runs `clasp push -f` to deploy to Google Apps Script
```

### 2. **main.tf** (Infrastructure)
```hcl
- Stores Google Auth Token securely in Secrets Manager
- CodeBuild Project pulls from GitHub
- GitHub Webhook triggers CodeBuild on push
- IAM permissions allow CodeBuild to read the secret
```

---

## Setup Steps

### Step 1: Generate Google Apps Script Authentication Token

```bash
# Install clasp globally
npm install -g @google/clasp

# Authenticate with Google
clasp login

# This creates ~/.clasprc.json with your auth token
# Copy the contents of this file - you'll need it next
cat ~/.clasprc.json
```

### Step 2: Set the Token in Terraform Variables

Edit or create `terraform.tfvars`:
```hcl
google_auth_token = "YOUR_CLASPRC_JSON_CONTENT_HERE"
```

Or pass it via environment variable:
```bash
export TF_VAR_google_auth_token='{"token":...}'
```

### Step 3: Ensure Your Google Apps Script Has .clasp.json

Your Apps Script project must have a `.clasp.json` file in the root:
```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

Get your script ID from: https://script.google.com → Project Settings → Script ID

### Step 4: Push to GitHub Repository

Make sure your repository is set to: `https://github.com/jackdack0102/gemini-finance-automation`

### Step 5: Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

---

## How It Works

### 1. **You Push Code to GitHub**
```bash
git add .
git commit -m "Update script"
git push origin main
```

### 2. **GitHub Webhook Triggers**
- AWS CodeBuild automatically detects the push
- Webhook fires with push event details

### 3. **CodeBuild Runs buildspec.yml**
```
1. Install @google/clasp
2. Extract CLASP_AUTH from AWS Secrets Manager
3. Create ~/.clasprc.json from the secret
4. Run `clasp push -f` to deploy
```

### 4. **Code Deployed to Google Apps Script**
- Your Google Apps Script is automatically updated
- Changes are live immediately

---

## Testing the Pipeline

### Test 1: Manual CodeBuild Run
```bash
# In AWS Console, go to CodeBuild → Projects → gemini-gas-deploy
# Click "Start build"
# Watch the build logs
```

### Test 2: Test GitHub Webhook
```bash
# Make a small change to Code.js
git add Code.js
git commit -m "Test webhook trigger"
git push origin main

# Go to AWS CodeBuild → Build history
# You should see a new build start within 30 seconds
```

---

## Troubleshooting

### ❌ Build Fails with "clasp login required"
**Solution:** Your auth token isn't being read correctly
- Check AWS Secrets Manager has the correct value
- Verify `CLASP_AUTH` environment variable is set in buildspec.yml

### ❌ Build Fails with "Script ID not found"
**Solution:** .clasp.json is missing or incorrect
- Ensure `.clasp.json` is in your repository root
- Verify the scriptId is correct

### ❌ Webhook Not Triggering
**Solution:** GitHub connection may need manual authorization
- In AWS CodeBuild → Edit project → Source → GitHub
- Click "Connect" to re-authenticate with GitHub if needed

### ✅ Check Build Logs
```bash
# View most recent build logs
aws codebuild batch-get-builds \
  --ids $(aws codebuild list-builds-for-project --project-name gemini-gas-deploy --query 'ids[0]' --output text) \
  --query 'builds[0].logs' --output text
```

---

## Important Files

| File | Purpose |
|------|---------|
| `buildspec.yml` | Tells CodeBuild what to do during build |
| `.clasp.json` | Links your local repo to Google Apps Script project |
| `main.tf` | AWS infrastructure setup |
| `terraform.tfvars` | Stores sensitive data (add to .gitignore) |

---

## Security Best Practices

✅ **What's Protected:**
- Auth token stored in AWS Secrets Manager (encrypted)
- IAM roles restrict who can access secrets
- GitHub password never stored

❌ **Don't Do:**
- Don't commit `.clasprc.json` to GitHub
- Don't hardcode credentials in buildspec.yml
- Don't share your terraform.tfvars file

---

## Next Steps

1. **Monitor Deployments**: Set up CloudWatch alerts for failed builds
2. **Add Testing**: Add tests to buildspec.yml before pushing
3. **Multiple Branches**: Add separate pipelines for staging/production
4. **Slack Notifications**: Send build status to Slack

---

## Useful Commands

```bash
# Trigger a manual build
aws codebuild start-build --project-name gemini-gas-deploy

# View build history
aws codebuild list-builds-for-project --project-name gemini-gas-deploy

# View detailed build info
aws codebuild batch-get-builds --ids BUILD_ID

# Watch logs in real-time (requires awslogs)
aws logs tail /aws/codebuild/gemini-gas-deploy --follow
```
