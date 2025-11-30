# ESHF Embeddings - Deployment Guide

This guide covers deploying the ESHF embeddings pipeline to Azure using Terraform and GitHub Actions.

## Prerequisites

Before deploying, ensure you have:

1. **Azure Subscription**
   - Subscription ID: `4aa2537d-bdcc-4b24-832a-58dfadbc5d71`
   - Appropriate permissions to create resources

2. **Terraform**
   - Install: https://www.terraform.io/downloads
   - Version: >= 1.0

3. **Azure CLI**
   - Install: https://docs.microsoft.com/cli/azure/install-azure-cli
   - Login: `az login`

4. **Credentials**
   - Cosmos DB key
   - OpenAI API key
   - Pinecone API key

## Infrastructure Deployment

### Step 1: Configure Terraform Variables

Create `terraform/terraform.tfvars` with your sensitive values:

```hcl
# terraform/terraform.tfvars
cosmos_key        = "your-cosmos-db-key"
openai_api_key    = "sk-proj-..."
pinecone_api_key  = "pcsk_..."

# Optional overrides
environment = "dev"
batch_size  = "10"
```

**IMPORTANT:** Never commit `terraform.tfvars` to git (it's already in `.gitignore`).

### Step 2: Initialize Terraform

```bash
cd terraform
terraform init
```

This downloads the required Azure provider.

### Step 3: Plan Infrastructure

```bash
terraform plan
```

Review the planned changes. You should see resources like:
- Resource Group: `rg-eshf-embeddings-dev`
- Storage Account: `steshfembeddev`
- Function App: `func-eshf-embeddings-dev`
- Application Insights: `appi-eshf-embeddings-dev`
- 2 Storage Queues: `posts-to-process`, `embeddings-ready`

### Step 4: Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted. This creates all Azure resources (~2-3 minutes).

### Step 5: Note the Outputs

Terraform outputs important values:

```bash
terraform output
```

Save these values:
- `function_app_name` - Used for deployment
- `function_app_url` - Function endpoints
- `application_insights_instrumentation_key` - Monitoring

## Application Deployment

### Option 1: Deploy via Azure Functions Core Tools (Local)

```bash
# From project root
npm run build
func azure functionapp publish func-eshf-embeddings-dev
```

### Option 2: Deploy via GitHub Actions (Recommended)

#### A. Setup GitHub Repository Secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:

1. **AZURE_CREDENTIALS**

   Create a service principal:
   ```bash
   az ad sp create-for-rbac --name "github-eshf-embeddings" \
     --role contributor \
     --scopes /subscriptions/4aa2537d-bdcc-4b24-832a-58dfadbc5d71 \
     --sdk-auth
   ```

   Copy the entire JSON output and paste as the secret value.

2. **Other secrets** (if using Key Vault)
   - `COSMOS_KEY`
   - `OPENAI_API_KEY`
   - `PINECONE_API_KEY`

#### B. Trigger Deployment

**Automatic deployment on push to main:**
```bash
git push origin main
```

**Manual deployment:**
1. Go to **Actions** tab in GitHub
2. Select **Deploy to Azure** workflow
3. Click **Run workflow**
4. Choose environment (dev/staging/prod)
5. Click **Run workflow**

## Post-Deployment Verification

### 1. Check Function App Health

```bash
curl https://func-eshf-embeddings-dev.azurewebsites.net/api/status
```

Expected response:
```json
{
  "totalPosts": 200000,
  "processedPosts": 0,
  "unprocessedPosts": 200000,
  "queueDepth": 0,
  "percentComplete": "0.00",
  "timestamp": "2025-11-29T..."
}
```

### 2. Trigger Manual Processing

```bash
curl -X POST https://func-eshf-embeddings-dev.azurewebsites.net/api/process
```

Expected response:
```json
{
  "message": "Posts enqueued for processing",
  "found": 10,
  "enqueued": 10
}
```

### 3. Monitor in Azure Portal

**Function App Metrics:**
1. Open Azure Portal
2. Navigate to Function App: `func-eshf-embeddings-dev`
3. Go to **Monitoring > Metrics**
4. Monitor:
   - Function Execution Count
   - Function Execution Units
   - Errors

**Application Insights:**
1. Navigate to Application Insights: `appi-eshf-embeddings-dev`
2. Go to **Investigate > Live Metrics**
3. Watch real-time function executions

**Storage Queues:**
1. Navigate to Storage Account: `steshfembeddev`
2. Go to **Queue service > Queues**
3. Check message counts in:
   - `posts-to-process`
   - `embeddings-ready`

### 4. Check Logs

**Live streaming:**
```bash
func azure functionapp logstream func-eshf-embeddings-dev
```

**Or in Azure Portal:**
1. Function App > **Monitoring > Log stream**

## Configuration Updates

### Update Application Settings

```bash
az functionapp config appsettings set \
  --name func-eshf-embeddings-dev \
  --resource-group rg-eshf-embeddings-dev \
  --settings BATCH_SIZE=20
```

### Update Infrastructure

1. Modify `terraform/*.tf` files
2. Run `terraform plan` to preview changes
3. Run `terraform apply` to apply changes

## Troubleshooting

### Functions Not Triggering

**Check Timer Function:**
```bash
# View timer schedule
az functionapp show \
  --name func-eshf-embeddings-dev \
  --resource-group rg-eshf-embeddings-dev
```

**Manually trigger timer:**
```bash
az functionapp function invoke \
  --name func-eshf-embeddings-dev \
  --resource-group rg-eshf-embeddings-dev \
  --function-name postDiscovery
```

### Queue Functions Not Processing

1. Check queue depth:
   ```bash
   az storage queue list \
     --account-name steshfembeddev \
     --output table
   ```

2. Check for poison messages:
   - Queues: `posts-to-process-poison`, `embeddings-ready-poison`

3. Restart Function App:
   ```bash
   az functionapp restart \
     --name func-eshf-embeddings-dev \
     --resource-group rg-eshf-embeddings-dev
   ```

### High Error Rate

1. Check Application Insights failures
2. Review function logs for errors
3. Check quota limits:
   - OpenAI API rate limits
   - Pinecone capacity
   - Cosmos DB RU/s

### Slow Processing

1. Increase Function App scale:
   ```bash
   # Check current plan
   az functionapp plan show \
     --name asp-eshf-embeddings-dev \
     --resource-group rg-eshf-embeddings-dev
   ```

2. Increase `BATCH_SIZE` (carefully - watch for timeouts)

3. Monitor queue depth - should be decreasing over time

## Cleanup

### Delete All Resources

```bash
cd terraform
terraform destroy
```

Type `yes` when prompted. This removes all Azure resources.

### Keep Infrastructure, Delete Data

Manually clear queues:
```bash
az storage queue clear --name posts-to-process --account-name steshfembeddev
az storage queue clear --name embeddings-ready --account-name steshfembeddev
```

## Cost Estimation

**Monthly costs for dev environment (approximate):**

| Resource | Pricing | Estimated Cost |
|----------|---------|----------------|
| Function App (Consumption) | Per execution + GB-seconds | $5-10 |
| Storage Account | Per GB + transactions | $1-2 |
| Application Insights | Per GB ingested | $2-5 |
| Cosmos DB | Provided separately | - |
| OpenAI API | Per 1M tokens | $10-50 |
| Pinecone | Provided separately | - |
| **Total Azure (excluding APIs)** | | **$8-17/month** |

**Processing 500K posts:**
- Estimated Azure cost: ~$5-10 one-time
- OpenAI API cost: ~$20-50 (depending on content length)

## Security Best Practices

1. **Never commit secrets** - Use Key Vault or GitHub Secrets
2. **Use managed identities** - For Cosmos DB access (future enhancement)
3. **Enable private endpoints** - For production environments
4. **Rotate keys regularly** - OpenAI, Pinecone, Storage account
5. **Monitor access logs** - Enable diagnostic logging
6. **Restrict network access** - Use IP restrictions for HTTP triggers

## Support

For issues or questions:
- Check Application Insights logs
- Review function execution history
- Check GitHub Actions workflow runs
- Verify all environment variables are set correctly
