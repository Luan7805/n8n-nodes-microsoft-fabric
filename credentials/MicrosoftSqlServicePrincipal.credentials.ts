import { ICredentialType, INodeProperties } from 'n8n-workflow';

// eslint-disable-next-line @n8n/community-nodes/credential-test-required
export class MicrosoftSqlServicePrincipal implements ICredentialType {
	name = 'microsoftSqlServicePrincipal';
	displayName = 'Microsoft SQL (Service Principal)';
	// @ts-expect-error Forcing icon override not supported by current types
	icon = 'file:./icons/mssql.svg';
	documentationUrl = 'https://learn.microsoft.com/en-us/fabric/data-factory/service-principals';
	properties: INodeProperties[] = [
		{
			displayName: 'Authentication Type',
			name: 'authType',
			type: 'hidden',
			default: 'servicePrincipal',
		},
		{
			displayName: 'Server',
			name: 'server',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Tenant ID',
			name: 'tenantId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
}
