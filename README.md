# RFC MCP Server

An MCP server for fetching, parsing, and reading RFCs from the ietf.org website. This server provides tools and resources to interact with RFC documents programmatically.

## Features

- Fetch RFC documents by number
- Search for RFCs by keyword
- Extract specific sections from RFC documents
- Parse both HTML and TXT format RFCs
- Caching for better performance

## Installation

Configure your MCP settings file to use the server:

```json
{
  "mcpServers": {
    "rfc-server": {
      "command": "npx",
      "args": ["@mjpitz/mcp-rfc"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Available Tools

### get_rfc

Fetch an RFC document by its number.

**Parameters:**
- `number` (string, required): RFC number (e.g. "2616")
- `format` (string, optional): Output format (full, metadata, sections), default: "full"

**Example:**
```json
{
  "number": "2616",
  "format": "metadata"
}
```

### search_rfcs

Search for RFCs by keyword.

**Parameters:**
- `query` (string, required): Search keyword or phrase
- `limit` (number, optional): Maximum number of results to return, default: 10

**Example:**
```json
{
  "query": "http protocol",
  "limit": 5
}
```

### get_rfc_section

Get a specific section from an RFC.

**Parameters:**
- `number` (string, required): RFC number (e.g. "2616")
- `section` (string, required): Section title or number to retrieve

**Example:**
```json
{
  "number": "2616",
  "section": "Introduction"
}
```

## Available Resources

### Resource Templates

- `rfc://{number}`: Get an RFC document by its number
- `rfc://search/{query}`: Search for RFCs by keyword

## Development

- Run in watch mode: `npm run dev`
- Start the server: `npm run start`

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Implementation Details

The server implements two main components:

1. **RFC Service**: Handles fetching, parsing, and extracting data from RFCs
2. **MCP Server**: Implements the MCP protocol and exposes tools and resources

The RFC service supports both HTML and TXT format RFCs, attempting to use HTML first for better structure, then falling back to TXT format if needed.
