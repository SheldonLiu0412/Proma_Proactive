#!/usr/bin/env npx tsx
/**
 * llm-client.ts
 *
 * Anthropic API 兼容的 LLM 客户端。
 * 支持 MiniMax 等 Anthropic 格式兼容的 provider。
 *
 * 配置来源：config/llm-config.json
 *
 * 重试策略：
 *   - 调用层：可重试错误（网络错误、5xx、429）自动指数退避重试，最多 3 次
 *   - 不可重试错误（401/403/400 等）立即抛出
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(__dirname, "../../config/llm-config.json");

// ---------- 类型定义 ----------

export interface LLMConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: boolean;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature: number;
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

interface AnthropicContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------- 配置加载 ----------

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadLLMConfig(): LLMConfig {
  const fileConfig = loadJson<Partial<LLMConfig>>(CONFIG_PATH);

  if (!fileConfig) {
    throw new Error(`LLM config not found: ${CONFIG_PATH}`);
  }

  const baseUrl = fileConfig.baseUrl || "https://api.minimaxi.com/anthropic";
  const apiKey = fileConfig.apiKey;
  const model = fileConfig.model || "MiniMax-M2.7-highspeed";

  if (!apiKey) {
    throw new Error(
      `LLM API key not found. Please configure apiKey in ${CONFIG_PATH}`
    );
  }

  return {
    provider: fileConfig.provider || "anthropic-compatible",
    baseUrl,
    apiKey,
    model,
    temperature: fileConfig.temperature ?? 0.3,
    maxTokens: fileConfig.maxTokens ?? 4096,
    thinking: fileConfig.thinking ?? false,
  };
}

// ---------- 重试工具 ----------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(status: number, errorText: string): boolean {
  // 网络层错误或明确可重试的 HTTP 状态码
  if (status === 0) return true; // fetch 网络错误
  if (status === 429) return true; // 限流
  if (status >= 500 && status < 600) return true; // 服务端错误
  // 某些 408 Request Timeout
  if (status === 408) return true;
  return false;
}

// ---------- API 调用（带重试） ----------

export interface CallLLMOptions {
  system?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  retries?: number;      // 最大重试次数，默认 3
  retryDelay?: number;   // 初始重试延迟(ms)，默认 1000
}

export async function callLLM(
  userPrompt: string,
  options: CallLLMOptions = {}
): Promise<string> {
  const config = loadLLMConfig();
  const {
    system,
    jsonMode,
    maxTokens,
    temperature,
    retries = 3,
    retryDelay = 1000,
  } = options;

  const requestBody: AnthropicRequest = {
    model: config.model,
    max_tokens: maxTokens || config.maxTokens,
    messages: [{ role: "user", content: userPrompt }],
    temperature: temperature ?? config.temperature,
  };

  if (system) {
    requestBody.system = system;
  }

  if (!config.thinking) {
    requestBody.thinking = { type: "disabled" };
  }

  let finalSystem = system || "";
  if (jsonMode) {
    finalSystem =
      finalSystem +
      "\n\n重要：你必须只输出合法的 JSON 对象，不要输出任何其他文本、解释或 markdown 格式。";
    requestBody.system = finalSystem.trim();
  }

  const baseUrl = config.baseUrl.replace(/\/v1\/?$/, "");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.error(`[llm-client] 第 ${attempt}/${retries} 次重试，等待 ${delay}ms...`);
      await sleep(delay);
    }

    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": config.apiKey,
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const err = new Error(
          `LLM API error: ${response.status} ${response.statusText}\n${errorText}`
        );

        // 不可重试的错误直接抛出
        if (!isRetryableError(response.status, errorText)) {
          throw err;
        }

        lastError = err;
        console.error(`[llm-client] 请求失败 (${response.status})，将在稍后重试`);
        continue;
      }

      const data = (await response.json()) as AnthropicResponse;
      const textBlocks = data.content.filter((b) => b.type === "text");
      const result = textBlocks.map((b) => b.text).join("").trim();

      if (!result) {
        throw new Error("LLM returned empty response");
      }

      return result;
    } catch (err: any) {
      // 网络错误（fetch 抛出的）可重试
      if (err.message?.includes("fetch") || err.message?.includes("network") || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
        lastError = err;
        console.error(`[llm-client] 网络错误，将在稍后重试: ${err.message}`);
        continue;
      }

      // 如果不是最后一次尝试，且不是已标记为可重试的，也重试
      if (attempt < retries && lastError === null) {
        lastError = err;
        console.error(`[llm-client] 请求异常，将在稍后重试: ${err.message}`);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error("LLM call failed after all retries");
}

// ---------- 便捷方法 ----------

export async function callLLMJson<T>(
  userPrompt: string,
  options: CallLLMOptions = {}
): Promise<T> {
  const raw = await callLLM(userPrompt, { ...options, jsonMode: true });

  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON. Raw response:\n${raw}\n\nError: ${err}`
    );
  }
}

// ---------- 测试入口 ----------

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const config = loadLLMConfig();
      console.log("LLM Config loaded:");
      console.log(`  Provider: ${config.provider}`);
      console.log(`  Base URL: ${config.baseUrl}`);
      console.log(`  Model: ${config.model}`);
      console.log(`  Temperature: ${config.temperature}`);
      console.log(`  Max Tokens: ${config.maxTokens}`);
      console.log(`  Thinking: ${config.thinking}`);

      console.log("\nTesting simple call...");
      const result = await callLLM("Say 'LLM client is ready' and nothing else.");
      console.log("Result:", result);
    } catch (err) {
      console.error("Test failed:", err);
      process.exit(1);
    }
  })();
}
