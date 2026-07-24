const fs = require('fs');

const agentCode = fs.readFileSync('src/agent.js', 'utf-8');
const lines = agentCode.split(/\r?\n/);

// Find bounds
const llmStart = lines.findIndex(l => l.startsWith('async function llmFetch'));
const llmEnd = lines.findIndex(l => l.startsWith('function cleanMalformedJsonString'));
const cleanJsonEnd = lines.findIndex(l => l.startsWith('function parseAssistantAction'));
const parseEnd = lines.findIndex(l => l.startsWith('const MAX_CONTEXT_MESSAGES'));

const libStart = lines.findIndex(l => l.startsWith('async function runLibraryModeSubLoop'));
const libEnd = lines.findIndex((l, i) => i > libStart && l.startsWith('}')) + 1; // get closing brace

// Extract llmClient.js
const llmClientCode = `
const { getLmStudioEndpoint, config, agentState, broadcastTerminal } = require('../state');

` + lines.slice(llmStart, parseEnd).join('\n') + `

module.exports = { llmFetch, cleanMalformedJsonString, parseAssistantAction };
`;
fs.writeFileSync('src/llm/llmClient.js', llmClientCode);

// Extract libraryMode.js
const libModeCode = `
const fs = require('fs');
const path = require('path');
const { agentState, broadcastState, broadcastTerminal, addMessage } = require('../state');
const { execute_command } = require('../tools/filesystem');
const { searchKnowledge } = require('../rag/vectorSearch');

` + lines.slice(libStart, libEnd).join('\n') + `

module.exports = { runLibraryModeSubLoop };
`;
fs.writeFileSync('src/modes/libraryMode.js', libModeCode);

// Reconstruct agent.js
let newAgentCode = lines.slice(0, llmStart).join('\n') + '\n';
newAgentCode += `const { llmFetch, cleanMalformedJsonString, parseAssistantAction } = require('./llm/llmClient');\n`;
newAgentCode += `const { runLibraryModeSubLoop } = require('./modes/libraryMode');\n\n`;
newAgentCode += lines.slice(parseEnd, libStart).join('\n') + '\n';
newAgentCode += lines.slice(libEnd).join('\n') + '\n';

fs.writeFileSync('src/agent.js', newAgentCode);
console.log('Successfully modularized agent.js');
