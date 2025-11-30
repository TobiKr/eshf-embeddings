output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "function_app_name" {
  description = "Name of the Azure Function App"
  value       = azurerm_linux_function_app.main.name
}

output "function_app_url" {
  description = "Default hostname of the Function App"
  value       = "https://${azurerm_linux_function_app.main.default_hostname}"
}

output "function_app_id" {
  description = "Resource ID of the Function App"
  value       = azurerm_linux_function_app.main.id
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "storage_connection_string" {
  description = "Storage account connection string"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "application_insights_name" {
  description = "Name of Application Insights instance"
  value       = azurerm_application_insights.main.name
}

output "application_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "application_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "posts_to_process_queue_name" {
  description = "Name of the posts-to-process queue"
  value       = azurerm_storage_queue.posts_to_process.name
}

output "embeddings_ready_queue_name" {
  description = "Name of the embeddings-ready queue"
  value       = azurerm_storage_queue.embeddings_ready.name
}
