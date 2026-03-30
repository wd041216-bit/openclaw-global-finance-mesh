import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LegalDocument {
  id: string;
  title: string;
  jurisdiction: string;
  domain: string;
  sourceType: string;
  sourceRef: string;
  tags: string[];
  summary: string;
  body: string;
  updatedAt: string;
}

export interface SearchResult {
  document: LegalDocument;
  score: number;
  excerpt: string;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const LIBRARY_PATH = path.join(REPO_ROOT, "data", "legal-library", "library.json");

export class LegalLibraryStore {
  private readonly libraryPath: string;

  constructor(libraryPath = LIBRARY_PATH) {
    this.libraryPath = libraryPath;
  }

  async listDocuments(): Promise<LegalDocument[]> {
    const payload = await this.load();
    return payload.documents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async search(query: string, topK = 5): Promise<SearchResult[]> {
    const normalizedQuery = tokenize(query);
    if (normalizedQuery.length === 0) {
      return [];
    }

    const documents = await this.listDocuments();
    return documents
      .map((document) => {
        const haystack = `${document.title}\n${document.summary}\n${document.body}\n${document.tags.join(" ")}`;
        const score = rankTokens(normalizedQuery, tokenize(haystack));
        return {
          document,
          score,
          excerpt: buildExcerpt(document.body, normalizedQuery),
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  async createDocument(input: Partial<LegalDocument> & { title: string; body: string }): Promise<LegalDocument> {
    const payload = await this.load();
    const now = new Date().toISOString();
    const document: LegalDocument = {
      id: input.id?.trim() || slugify(`${input.title}-${now}`),
      title: input.title.trim(),
      jurisdiction: input.jurisdiction?.trim() || "GLOBAL",
      domain: input.domain?.trim() || "general",
      sourceType: input.sourceType?.trim() || "manual",
      sourceRef: input.sourceRef?.trim() || `manual://${hashText(input.title + input.body).slice(0, 12)}`,
      tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [],
      summary: input.summary?.trim() || summarizeBody(input.body),
      body: input.body.trim(),
      updatedAt: now,
    };

    const nextDocuments = payload.documents.filter((item) => item.id !== document.id);
    nextDocuments.push(document);
    await this.save({ documents: nextDocuments });
    return document;
  }

  async ingest(input: {
    title?: string;
    jurisdiction?: string;
    domain?: string;
    sourceType?: string;
    sourceRef?: string;
    tags?: string[];
    body?: string;
    url?: string;
    filePath?: string;
  }): Promise<LegalDocument> {
    let body = input.body?.trim();

    if (!body && input.url) {
      const response = await fetch(input.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch source URL (${response.status}).`);
      }
      body = stripHtml(await response.text());
    }

    if (!body && input.filePath) {
      body = await fs.readFile(path.resolve(input.filePath), "utf8");
    }

    if (!body) {
      throw new Error("Provide body, url, or filePath for ingestion.");
    }

    return this.createDocument({
      title: input.title?.trim() || guessTitleFromInput(input.url, input.filePath) || "Untitled legal note",
      jurisdiction: input.jurisdiction,
      domain: input.domain,
      sourceType: input.sourceType || (input.url ? "official_url" : "manual"),
      sourceRef: input.sourceRef || input.url || input.filePath,
      tags: input.tags,
      body,
    });
  }

  async buildContext(query: string, topK = 4): Promise<{ context: string; citations: Array<Record<string, string>> }> {
    const matches = await this.search(query, topK);
    const citations = matches.map((match) => ({
      id: match.document.id,
      title: match.document.title,
      sourceRef: match.document.sourceRef,
      jurisdiction: match.document.jurisdiction,
      excerpt: match.excerpt,
    }));

    const context = citations
      .map(
        (citation, index) =>
          `[Legal Source ${index + 1}] ${citation.title} (${citation.jurisdiction})\nSource: ${citation.sourceRef}\nExcerpt: ${citation.excerpt}`,
      )
      .join("\n\n");

    return {
      context,
      citations,
    };
  }

  private async load(): Promise<{ documents: LegalDocument[] }> {
    try {
      const content = await fs.readFile(this.libraryPath, "utf8");
      const payload = JSON.parse(content) as { documents?: LegalDocument[] };
      return {
        documents: Array.isArray(payload.documents) ? payload.documents : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await fs.mkdir(path.dirname(this.libraryPath), { recursive: true });
        const seed = { documents: [] as LegalDocument[] };
        await fs.writeFile(this.libraryPath, JSON.stringify(seed, null, 2), "utf8");
        return seed;
      }
      throw error;
    }
  }

  private async save(payload: { documents: LegalDocument[] }): Promise<void> {
    await fs.mkdir(path.dirname(this.libraryPath), { recursive: true });
    await fs.writeFile(this.libraryPath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function rankTokens(queryTokens: string[], documentTokens: string[]): number {
  const docMap = new Map<string, number>();
  for (const token of documentTokens) {
    docMap.set(token, (docMap.get(token) ?? 0) + 1);
  }

  return queryTokens.reduce((score, token) => score + (docMap.get(token) ?? 0), 0);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((item) => item.length >= 2);
}

function buildExcerpt(body: string, queryTokens: string[]): string {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (!normalizedBody) {
    return "";
  }

  const lower = normalizedBody.toLowerCase();
  const index = queryTokens
    .map((token) => lower.indexOf(token.toLowerCase()))
    .find((value) => value != null && value >= 0);

  if (index == null || index < 0) {
    return normalizedBody.slice(0, 240);
  }

  const start = Math.max(0, index - 80);
  const end = Math.min(normalizedBody.length, index + 180);
  return normalizedBody.slice(start, end);
}

function summarizeBody(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 160);
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessTitleFromInput(url?: string, filePath?: string): string | null {
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname;
    } catch {
      return url;
    }
  }

  if (filePath) {
    return path.basename(filePath);
  }

  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
