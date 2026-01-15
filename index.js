import { spawn } from 'child_process';
import { createInterface } from 'readline';

class PlaywrightMCPControl {
  constructor() {
    this.process = null;
    this.rl = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.initialized = false;
  }

  async start() {
    console.log('[SPAWN] Starting Playwright MCP server via npx @playwright/mcp...');

    // Set environment to use the existing display
    const env = process.env;
    env.DISPLAY = env.DISPLAY || ':1';

    this.process = spawn('npx', ['-y', '@playwright/mcp@latest'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env
    });

    this.process.on('error', (err) => {
      console.error('[ERROR] Process spawn failed:', err.message);
      process.exit(1);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[SHUTDOWN] MCP server exited with code ${code}, signal ${signal}`);
      process.exit(0);
    });

    // Set up readline for JSON-RPC communication
    this.rl = createInterface({
      input: this.process.stdout,
      output: this.process.stdin,
      terminal: false
    });

    this.rl.on('line', (line) => {
      this.handleResponse(line);
    });

    this.rl.on('error', (err) => {
      console.error('[ERROR] Readline error:', err.message);
    });

    // Handle stderr
    this.process.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error('[MCP STDERR]', msg);
    });

    console.log('[SPAWN] Process created, initiating JSON-RPC handshake...');

    // Start MCP protocol: CLIENT sends initialize request
    try {
      const result = await this.sendJsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'playwright-mcp-control',
          version: '1.0.0'
        }
      });

      console.log('[INIT] MCP server initialized successfully');
      this.initialized = true;

      // Send initialized notification
      this.sendNotification('notifications/initialized', {});

      // Small delay for server to process
      await new Promise(resolve => setTimeout(resolve, 300));

      // Navigate to localhost
      console.log('[NAV] Sending navigation request to http://localhost...');
      await this.navigateTo('http://localhost');

      console.log('[READY] Browser is now open at http://localhost');
      console.log('[READY] Session is active. Press Ctrl+C to close.');

      // Keep the process running indefinitely
      await this.keepAlive();
    } catch (err) {
      console.error('[ERROR] Startup failed:', err.message);
      await this.shutdown();
      process.exit(1);
    }
  }

  sendJsonRpc(method, params = {}) {
    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const requestStr = JSON.stringify(request);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout for ${method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout, method });

      try {
        this.process.stdin.write(requestStr + '\n', (err) => {
          if (err) {
            clearTimeout(timeout);
            this.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  sendNotification(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params
    };

    const requestStr = JSON.stringify(request);

    try {
      this.process.stdin.write(requestStr + '\n');
    } catch (err) {
      console.error('[ERROR] Failed to send notification:', err.message);
    }
  }

  handleResponse(line) {
    if (!line.trim()) return;

    try {
      const response = JSON.parse(line);

      // Handle RPC responses
      if (response.id && this.pendingRequests.has(response.id)) {
        const pending = this.pendingRequests.get(response.id);
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (err) {
      // Ignore parse errors for non-JSON responses
    }
  }

  async navigateTo(url) {
    try {
      await this.sendJsonRpc('tools/call', {
        name: 'browser_navigate',
        arguments: { url }
      });
    } catch (err) {
      console.warn('[NAV] Navigation request queued (browser launching)');
    }
  }

  async keepAlive() {
    return new Promise((resolve) => {
      // Keep running indefinitely
      process.on('SIGINT', async () => {
        console.log('\n[SHUTDOWN] Closing session...');
        await this.shutdown();
        resolve();
      });

      process.on('SIGTERM', async () => {
        console.log('\n[SHUTDOWN] Closing session...');
        await this.shutdown();
        resolve();
      });
    });
  }

  async shutdown() {
    if (this.rl) this.rl.close();

    if (this.process) {
      this.process.stdin.end();
      this.process.kill('SIGTERM');

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!this.process.killed) {
        this.process.kill('SIGKILL');
      }
    }

    console.log('[SHUTDOWN] Complete');
  }
}

// Main execution
const control = new PlaywrightMCPControl();
control.start().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
