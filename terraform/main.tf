terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }

  subscription_id = var.subscription_id
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "rg-eshf-embeddings-${var.environment}"
  location = var.location

  tags = var.tags
}

# Storage Account for Function App and Queues
resource "azurerm_storage_account" "main" {
  name                     = "steshfembed${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = var.tags
}

# Storage Queues
resource "azurerm_storage_queue" "posts_to_process" {
  name                 = "posts-to-process"
  storage_account_name = azurerm_storage_account.main.name
}

resource "azurerm_storage_queue" "embeddings_ready" {
  name                 = "embeddings-ready"
  storage_account_name = azurerm_storage_account.main.name
}

# Application Insights
resource "azurerm_application_insights" "main" {
  name                = "appi-eshf-embeddings-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  application_type    = "Node.JS"

  tags = var.tags
}

# App Service Plan (Consumption Plan)
resource "azurerm_service_plan" "main" {
  name                = "asp-eshf-embeddings-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1" # Consumption Plan

  tags = var.tags
}

# Linux Function App
resource "azurerm_linux_function_app" "main" {
  name                       = "func-eshf-embeddings-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  service_plan_id            = azurerm_service_plan.main.id
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key

  site_config {
    application_stack {
      node_version = "20"
    }

    application_insights_connection_string = azurerm_application_insights.main.connection_string
    application_insights_key               = azurerm_application_insights.main.instrumentation_key
  }

  app_settings = {
    "FUNCTIONS_WORKER_RUNTIME"       = "node"
    "WEBSITE_NODE_DEFAULT_VERSION"   = "~20"
    "WEBSITE_RUN_FROM_PACKAGE"       = "1"

    # Cosmos DB
    "COSMOS_ENDPOINT"                = var.cosmos_endpoint
    "COSMOS_KEY"                     = var.cosmos_key
    "COSMOS_DATABASE"                = var.cosmos_database
    "COSMOS_CONTAINER"               = var.cosmos_container

    # OpenAI
    "OPENAI_API_KEY"                 = var.openai_api_key
    "OPENAI_MODEL"                   = var.openai_model

    # Pinecone
    "PINECONE_API_KEY"               = var.pinecone_api_key
    "PINECONE_HOST"                  = var.pinecone_host
    "PINECONE_INDEX"                 = var.pinecone_index

    # Processing Configuration
    "BATCH_SIZE"                     = var.batch_size
  }

  tags = var.tags
}
