import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { searchService } from "./search-service.js";
import { llmClient } from "../ai/llm-client.js";
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";
import type {
  ChatSessionRecord, ChatMessageRecord, CitationRecord,
  SearchSection
} from "../types.js";

const MAX_HISTORY_ROUNDS = 10;

export class ChatService {
  async createSession(userId: string, projectId: string, title?: string): Promise<ChatSessionRecord> {
    const id = randomUUID();
    const { rows } = await pool.query(
      `insert into chat_sessions (id, user_id, project_id, title) values ($1, $2, $3, $4) returning *`,
      [id, userId, projectId, title || "New Chat"]
    );
    return sessionFromRow(rows[0]);
  }

  async listSessions(userId: string, projectId: string): Promise<ChatSessionRecord[]> {
    const { rows } = await pool.query(
      "select * from chat_sessions where user_id = $1 and project_id = $2 order by updated_at desc",
      [userId, projectId]
    );
    return rows.map(sessionFromRow);
  }

  async getSession(sessionId: string, userId: string): Promise<{ session: ChatSessionRecord; messages: ChatMessageRecord[] } | null> {
    const { rows: sRows } = await pool.query(
      "select * from chat_sessions where id = $1 and user_id = $2", [sessionId, userId]
    );
    if (sRows.length === 0) return null;
    const { rows: mRows } = await pool.query(
      "select * from chat_messages where session_id = $1 order by created_at asc", [sessionId]
    );
    return {
      session: sessionFromRow(sRows[0]),
      messages: mRows.map(msgFromRow),
    };
  }

  async sendMessage(
    sessionId: string, userId: string, projectId: string,
    userMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<ChatMessageRecord> {
    // 1. Save user message
    const userMsgId = randomUUID();
    await pool.query(
      "insert into chat_messages (id, session_id, role, content) values ($1, $2, 'user', $3)",
      [userMsgId, sessionId, userMessage]
    );

    // 2. Get recent history
    const history = await this.getRecentHistory(sessionId, MAX_HISTORY_ROUNDS);

    // 3. Rewrite query with context
    let searchQuery = userMessage;
    if (history.length > 0 && config.LLM_API_KEY) {
      try {
        searchQuery = await this.rewriteQuery(userMessage, history);
      } catch (err) {
        logger.warn({ err }, "query rewrite failed, using original query");
      }
    }

    // 4. Search
    const searchResult = await searchService.search({
      query: searchQuery,
      sourceIds: [projectId],
      searchMode: config.DEFAULT_SEARCH_MODE,
      topK: 5,
      returnTrace: false,
    });

    // 5. Build citations and answer
    const citations = this.buildCitations(searchResult.sections);
    const contextMessages = history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const answer = await this.generateAnswer(searchResult.sections, contextMessages, userMessage, onChunk);

    // 6. Save assistant message
    const assistantMsgId = randomUUID();
    const { rows } = await pool.query(
      `insert into chat_messages (id, session_id, role, content, citations)
       values ($1, $2, 'assistant', $3, $4) returning *`,
      [assistantMsgId, sessionId, answer, JSON.stringify(citations)]
    );

    // Update session timestamp
    await pool.query("update chat_sessions set updated_at = now() where id = $1", [sessionId]);

    return msgFromRow(rows[0]);
  }

  async generateAnswer(
    sections: SearchSection[],
    history: { role: "user" | "assistant"; content: string }[],
    userMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const context = sections
      .map((s, i) => `[${i + 1}] ${s.heading ?? ""}\n${s.content}`)
      .join("\n\n");

    if (!config.LLM_API_KEY) {
      return `语言模型未配置，以下是检索到的相关内容：\n\n${context}`;
    }

    const systemPrompt = `你是一个知识库问答助手。请基于以下参考资料回答用户问题。如果资料不足以回答，请如实说明。

参考资料：
${context}

规则：
- 用中文回答
- 引用具体来源时标注编号，如 [1]、[2]
- 不要编造资料中没有的信息`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: userMessage },
    ];

    if (onChunk) {
      return llmClient.chatStream(messages, onChunk);
    }
    return llmClient.chat(messages);
  }

  buildCitations(sections: SearchSection[]): CitationRecord[] {
    return sections.map(s => ({
      chunkId: s.chunkId,
      documentId: s.documentId ?? "",
      documentTitle: "",
      heading: s.heading,
      content: s.content.slice(0, 200),
      score: s.score,
    }));
  }

  formatHistoryContext(history: { role: string; content: string }[]): string {
    return history.map(m => `${m.role}: ${m.content}`).join("\n");
  }

  buildRewritePrompt(userMessage: string, history: { role: string; content: string }[]): string {
    const context = this.formatHistoryContext(history);
    return `基于以下对话历史，将用户的追问改写为一个独立的检索查询。

对话历史：
${context}

用户追问：${userMessage}

改写后的检索查询：`;
  }

  private async rewriteQuery(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
    const prompt = this.buildRewritePrompt(userMessage, history);
    const rewritten = await llmClient.chat([
      { role: "user" as const, content: prompt },
    ]);
    return rewritten.trim();
  }

  private async getRecentHistory(sessionId: string, maxRounds: number): Promise<{ role: string; content: string }[]> {
    const limit = maxRounds * 2;
    const { rows } = await pool.query(
      "select role, content from chat_messages where session_id = $1 order by created_at desc limit $2",
      [sessionId, limit]
    );
    return rows.reverse().map(r => ({ role: String(r.role), content: String(r.content) }));
  }
}

function sessionFromRow(row: Record<string, unknown>): ChatSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    projectId: String(row.project_id),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function msgFromRow(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: String(row.role) as "user" | "assistant" | "system",
    content: String(row.content),
    citations: row.citations ? JSON.parse(String(row.citations)) as CitationRecord[] : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export const chatService = new ChatService();
