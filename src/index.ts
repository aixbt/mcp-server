#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import axios from 'axios'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Staging
const API_URL = 'https://core-api.aixbt.tech'

// Configure logging
const log = {
  info: (message: string, ...args: any[]) => {
    console.error(`[INFO] ${message}`, ...args)
  },
  debug: (message: string, ...args: any[]) => {
    console.error(`[DEBUG] ${message}`, ...args)
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args)
  },
  request: (method: string, url: string, params?: any) => {
    console.error(
      `[REQUEST] ${method} ${url}`,
      params ? `params: ${JSON.stringify(params)}` : '',
    )
  },
  response: (status: number, url: string, data: any) => {
    console.error(
      `[RESPONSE] ${status} ${url} data: ${JSON.stringify(data).substring(0, 200)}...`,
    )
  },
}

log.info('Starting AIXBT MCP server initialization')

// Validate API key
const apiKey = process.env.API_KEY
if (!apiKey) {
  log.error('API_KEY environment variable is not set')
  process.exit(1)
}
log.info('API key found in environment variables')

// Create MCP server
const server = new McpServer({
  name: 'AIXBT API Server',
  version: '1.0.0',
})
log.info('MCP server instance created')

// Common axios instance with authorization header
const aixbtApi = axios.create({
  headers: {
    'x-api-key': apiKey,
  },
})
log.info('Axios client configured with API key')

// Tool: list-project-latest-summaries
server.tool(
  'list-project-latest-summaries',
  {
    name: z
      .string()
      .min(2)
      .max(50)
      .describe('Project or token name (i.e. ETH)'),
    limit: z.number().min(1).max(50).describe('Maximum number of summaries'),
  },
  async ({ name, limit }) => {
    log.info(
      `Executing tool: list-project-latest-summaries with name=${name}, limit=${limit}`,
    )
    try {
      const url = `${API_URL}/v1/projects`
      const params = {
        limit: 1,
        ticker: name.toLowerCase(),
      }
      log.request('GET', url, params)

      const response = await aixbtApi.get(url, { params })
      log.response(response.status, url, response.data)

      if (
        response.data.status !== 200 ||
        !response.data.data ||
        response.data.data.length === 0
      ) {
        log.error(`Project not found: ${name}`)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Project not found' }),
            },
          ],
          isError: true,
        }
      }

      const project = response.data.data[0]
      log.debug(
        `Found project: ${project.name}, summaries count: ${project.summaries?.length || 0}`,
      )

      const summaries = project.summaries || []
      const limitedSummaries = summaries.slice(0, limit)
      log.debug(
        `Returning ${limitedSummaries.length} summaries for ${project.name}`,
      )

      const result = {
        projectName: project.name,
        summaries: limitedSummaries.map((summary: any) => ({
          description: summary.description,
        })),
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      log.error('Error fetching project summaries:', error)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to fetch project summaries',
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      }
    }
  },
)
log.info('Registered tool: list-project-latest-summaries')

// Tool: list-top-projects
server.tool(
  'list-top-projects',
  {
    limit: z.number().min(1).max(50).describe('Maximum number of projects'),
  },
  async ({ limit }) => {
    log.info(`Executing tool: list-top-projects with limit=${limit}`)
    try {
      const url = `${API_URL}/v1/projects`
      const params = { limit }
      log.request('GET', url, params)

      const response = await aixbtApi.get(url, { params })
      log.response(response.status, url, response.data)

      if (response.data.status !== 200 || !response.data.data) {
        log.error('Failed to retrieve projects from API')
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to retrieve projects' }),
            },
          ],
          isError: true,
        }
      }

      const projects = response.data.data
      log.debug(`Retrieved ${projects.length} projects`)

      const formattedProjects = projects.map((project: any) => ({
        name: project.name,
        score: project.score,
        rationale: project.rationale,
      }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formattedProjects, null, 2),
          },
        ],
      }
    } catch (error) {
      log.error('Error fetching top projects:', error)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to fetch top projects',
              details: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      }
    }
  },
)
log.info('Registered tool: list-top-projects')

// Add debug logging for each tool call and response
log.info('Setting up debug logging for server events')

// Start the server with stdio transport
const startServer = async () => {
  try {
    log.info('Initializing StdioServerTransport')
    const transport = new StdioServerTransport()

    log.info('Connecting server to transport')
    await server.connect(transport)

    log.info('Server connected successfully and ready to process requests')
  } catch (error) {
    log.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
