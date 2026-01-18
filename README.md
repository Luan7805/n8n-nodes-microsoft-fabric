# <img src="nodes/sql/mssql.svg" height="40"> n8n Node for Microsoft Fabric SQL

This project is a custom n8n node designed to connect with **Microsoft Fabric (Data Warehouse & Lakehouse)** SQL Endpoints.

It serves as a specialized replacement for the official Microsoft SQL node, addressing compatibility issues by using the `tedious-fabric` library and supporting **Service Principal (Azure AD)** authentication natively.

## Features

- **Native Fabric Support**: Uses `tedious-fabric` to handle authentication tokens correctly.
- **Service Principal Auth**: Connect using Tenant ID, Client ID, and Client Secret.
- **Operations**:
    - Execute Custom SQL Queries.
    - Insert, Update, and Delete rows.
- **Secure**: Forces encryption and TLS 1.2+ for all connections.


## Run Locally (Development)

To test this node with your local n8n installation:

**Install dependencies:**
```sh
npm install
```

**Start n8n and Watch for changes:**
```sh
# In the project folder, keep this running to auto-recompile on save:
npm run dev
```

## Credentials Setup

To connect to Microsoft Fabric, you need to create a Service Principal in Azure:

1. Go to **Microsoft Entra ID** > **App registrations**.
2. Create a new App.
3. Note down the **Application (client) ID** and **Directory (tenant) ID**.
4. Go to **Certificates & secrets** and create a new **Client secret**.
5. **Important:** Go to your Fabric Workspace, click **Manage Access**, and add this Service Principal (by name/ID).

## Contributing

Contributions are welcome! To contribute to this project, please fork the repository and submit a pull request with your changes.

If you encounter any issues or have suggestions, please feel free to [open an issue](https://github.com/Luan7805/n8n-nodes-microsoft-fabric/issues) on GitHub.
