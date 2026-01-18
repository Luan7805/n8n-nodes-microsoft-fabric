/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IResult } from 'mssql';
import mssql from 'mssql';
import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import { deepCopy } from 'n8n-workflow';

import { chunk, flatten } from './utils';
import { Connection as FabricConnection, Request as FabricRequest } from 'tedious-fabric';
import { ClientSecretCredential } from '@azure/identity';

import type { ITables, OperationInputData } from './interfaces';

export function copyInputItem(item: INodeExecutionData, properties: string[]): IDataObject {
	const newItem: IDataObject = {};
	for (const property of properties) {
		if (item.json[property] === undefined) {
			newItem[property] = null;
		} else {
			newItem[property] = deepCopy(item.json[property]);
		}
	}
	return newItem;
}

export function createTableStruct(
	getNodeParam: (name: string, index: number) => any,
	items: INodeExecutionData[],
	additionalProperties: string[] = [],
	keyName?: string,
): ITables {
	return items.reduce((tables, item, index) => {
		const table = getNodeParam('table', index) as string;
		const columnString = getNodeParam('columns', index) as string;
		const columns = columnString.split(',').map((column: string) => column.trim());
		const itemCopy = copyInputItem(item, columns.concat(additionalProperties));
		const keyParam = keyName ? (getNodeParam(keyName, index) as string) : undefined;
		if (tables[table] === undefined) {
			tables[table] = {};
		}
		if (tables[table][columnString] === undefined) {
			tables[table][columnString] = [];
		}
		if (keyName) {
			itemCopy[keyName] = keyParam;
		}
		tables[table][columnString].push(itemCopy);
		return tables;
	}, {} as ITables);
}

export async function executeQueryQueue(
	tables: ITables,
	buildQueryQueue: (data: OperationInputData) => Array<Promise<object>>,
): Promise<any[]> {
	return await Promise.all(
		Object.keys(tables).map(async (table) => {
			const columnsResults = Object.keys(tables[table]).map(async (columnString) => {
				return await Promise.all(
					buildQueryQueue({
						table,
						columnString,
						items: tables[table][columnString],
					}),
				);
			});
			return await Promise.all(columnsResults);
		}),
	);
}

export function formatColumns(columns: string) {
	return columns
		.split(',')
		.map((column) => `[${column.trim()}]`)
		.join(', ');
}


export function configurePool(credentials: IDataObject) {
	if (credentials.authType === 'servicePrincipal' || (credentials.clientId && credentials.tenantId)) {
		return new FabricConnectionAdapter(credentials);
	}

	const config: any = {
		server: credentials.server as string,
		port: credentials.port as number,
		database: credentials.database as string,
		connectionTimeout: 30000,
		requestTimeout: 30000,
		options: {
			enableArithAbort: false,
			tdsVersion: credentials.tdsVersion as string,
			encrypt: (credentials.encrypt as boolean) ?? true,
			trustServerCertificate: (credentials.allowUnauthorizedCerts as boolean) ?? true,
		},
	};

	config.user = credentials.user as string;
	config.password = credentials.password as string;

	if (credentials.domain) {
		config.domain = credentials.domain as string;
	}

	return new mssql.ConnectionPool(config);
}

class FabricConnectionAdapter {
	private config: any;
	private accessToken: string | null = null;

	constructor(credentials: IDataObject) {
		this.config = {
			server: credentials.server,
			database: credentials.database,
			tenantId: credentials.tenantId,
			clientId: credentials.clientId,
			clientSecret: credentials.clientSecret,
		};
	}

	async connect() {
		try {
			const azureCreds = new ClientSecretCredential(
				this.config.tenantId,
				this.config.clientId,
				this.config.clientSecret,
			);
			const tokenResponse = await azureCreds.getToken('https://database.windows.net/.default');
			this.accessToken = tokenResponse.token;
		} catch (error) {
			throw new Error(`Error generating Fabric Token: ${error.message}`);
		}
		return this;
	}

	async close() {
		return;
	}

	request() {
		if (!this.accessToken) throw new Error('Connection not started. Call connect() first.');
		return new FabricRequestAdapter(this.config, this.accessToken);
	}
}

class FabricRequestAdapter {
	private config: any;
	private token: string;
	private inputs: { [key: string]: any } = {};

	constructor(config: any, token: string) {
		this.config = config;
		this.token = token;
	}

	input(name: string, value: any) {
		this.inputs[name] = value;
	}

	async query(sql: string) {
		return new Promise((resolve, reject) => {
			const connectionConfig: any = {
				server: this.config.server,
				authentication: {
					type: 'azure-active-directory-access-token',
					options: { token: this.token },
				},
				options: {
					database: this.config.database,
					encrypt: true,
					trustServerCertificate: true,
					port: 1433,
					connectTimeout: 60000,
				},
			};

			const connection = new FabricConnection(connectionConfig);
			const rows: any[] = [];

			connection.on('connect', (err: any) => {
				if (err) return reject(err);

				const request = new FabricRequest(sql, (err: any, rowCount?: number) => {
					connection.close();
					if (err) return reject(err);

					resolve({
						recordsets: [rows],
						recordset: rows,
						rowsAffected: [rowCount || 0],
						output: {},
					});
				});

				request.on('row', (columns: any[]) => {
					const rowData: any = {};
					columns.forEach((col) => {
						rowData[col.metadata.colName] = col.value;
					});
					rows.push(rowData);
				});

				connection.execSql(request);
			});

			connection.on('error', (err: any) => {
				reject(err);
			});

			connection.connect();
		});
	}
}

const escapeTableName = (table: string) => {
	table = table.trim();
	if (table.startsWith('[') && table.endsWith(']')) {
		return table;
	} else {
		return `[${table}]`;
	}
};

const MSSQL_PARAMETER_LIMIT = 2100;

export function mssqlChunk(rows: IDataObject[]): IDataObject[][] {
	const chunked: IDataObject[][] = [[]];
	let currentParamCount = 0;

	for (const row of rows) {
		const rowValues = Object.values(row);
		const valueCount = rowValues.length;

		if (currentParamCount + valueCount >= MSSQL_PARAMETER_LIMIT) {
			chunked.push([]);
			currentParamCount = 0;
		}

		chunked[chunked.length - 1].push(row);

		currentParamCount += valueCount;
	}

	return chunked;
}

export async function insertOperation(tables: ITables, pool: mssql.ConnectionPool) {
	return await executeQueryQueue(
		tables,
		({ table, columnString, items }: OperationInputData): Array<Promise<object>> => {
			return mssqlChunk(items).map(async (insertValues) => {
				const request = pool.request();

				const valuesPlaceholder = [];

				for (const [rIndex, entry] of insertValues.entries()) {
					const row = Object.values(entry);
					valuesPlaceholder.push(`(${row.map((_, vIndex) => `@r${rIndex}v${vIndex}`).join(', ')})`);
					for (const [vIndex, value] of row.entries()) {
						request.input(`r${rIndex}v${vIndex}`, value);
					}
				}

				const query = `INSERT INTO ${escapeTableName(table)} (${formatColumns(
					columnString,
				)}) VALUES ${valuesPlaceholder.join(', ')};`;

				return await request.query(query);
			});
		},
	);
}

export async function updateOperation(tables: ITables, pool: mssql.ConnectionPool) {
	return await executeQueryQueue(
		tables,
		({ table, columnString, items }: OperationInputData): Array<Promise<object>> => {
			return items.map(async (item) => {
				const request = pool.request();
				const columns = columnString.split(',').map((column) => column.trim());

				const setValues: string[] = [];
				const condition = `${item.updateKey} = @condition`;
				request.input('condition', item[item.updateKey as string]);
				for (const [index, col] of columns.entries()) {
					setValues.push(`[${col}] = @v${index}`);
					request.input(`v${index}`, item[col]);
				}

				const query = `UPDATE ${escapeTableName(table)} SET ${setValues.join(
					', ',
				)} WHERE ${condition};`;

				return await request.query(query);
			});
		},
	);
}

export async function deleteOperation(tables: ITables, pool: mssql.ConnectionPool) {
	const queriesResults = await Promise.all(
		Object.keys(tables).map(async (table) => {
			const deleteKeyResults = Object.keys(tables[table]).map(async (deleteKey) => {
				const deleteItemsList = chunk(
					tables[table][deleteKey].map((item) =>
						copyInputItem(item as INodeExecutionData, [deleteKey]),
					),
					1000,
				);
				const queryQueue = deleteItemsList.map(async (deleteValues) => {
					const request = pool.request();
					const valuesPlaceholder: string[] = [];

					for (const [index, entry] of deleteValues.entries()) {
						valuesPlaceholder.push(`@v${index}`);
						request.input(`v${index}`, entry[deleteKey]);
					}

					const query = `DELETE FROM ${escapeTableName(
						table,
					)} WHERE [${deleteKey}] IN (${valuesPlaceholder.join(', ')});`;
					return await request.query(query);
				});
				return await Promise.all(queryQueue);
			});
			return await Promise.all(deleteKeyResults);
		})
	);

	return flatten(queriesResults).reduce(
		(acc: number, resp: mssql.IResult<object>): number =>
			(acc += resp.rowsAffected.reduce((sum: number, val: number) => (sum += val))),
		0,
	);
}

export async function executeSqlQueryAndPrepareResults(
	pool: mssql.ConnectionPool,
	rawQuery: string,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const rawResult: IResult<any> = await pool.request().query(rawQuery);
	const { recordsets, rowsAffected } = rawResult;
	if (Array.isArray(recordsets) && recordsets.length > 0) {
		const result: IDataObject[] = recordsets.length > 1 ? flatten(recordsets) : recordsets[0];

		return result.map((entry) => ({
			json: entry,
			pairedItem: [{ item: itemIndex }],
		}));
	} else if (rowsAffected && rowsAffected.length > 0) {
		return rowsAffected.map((affectedRows: number, idx: number) => ({
			json: {
				message: `Query ${idx + 1} executed successfully`,
				rowsAffected: affectedRows,
			},
			pairedItem: [{ item: itemIndex }],
		}));
	} else {
		return [
			{
				json: { message: 'Query executed successfully, but no rows were affected' },
				pairedItem: [{ item: itemIndex }],
			},
		];
	}
}
