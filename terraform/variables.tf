variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = "4aa2537d-bdcc-4b24-832a-58dfadbc5d71"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "westeurope"
}

variable "cosmos_endpoint" {
  description = "Cosmos DB endpoint URL"
  type        = string
}

variable "cosmos_key" {
  description = "Cosmos DB primary key"
  type        = string
  sensitive   = true
}

variable "cosmos_database" {
  description = "Cosmos DB database name"
  type        = string
  default     = "eshf-forum"
}

variable "cosmos_container" {
  description = "Cosmos DB container name"
  type        = string
  default     = "posts"
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "openai_model" {
  description = "OpenAI embedding model"
  type        = string
  default     = "text-embedding-3-large"
}

variable "pinecone_api_key" {
  description = "Pinecone API key"
  type        = string
  sensitive   = true
}

variable "pinecone_host" {
  description = "Pinecone index host URL"
  type        = string
}

variable "pinecone_index" {
  description = "Pinecone index name"
  type        = string
  default     = "eshf"
}

variable "batch_size" {
  description = "Number of posts to process in each batch"
  type        = string
  default     = "500"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "ESHF-Embeddings"
    ManagedBy   = "Terraform"
    Environment = "dev"
  }
}
