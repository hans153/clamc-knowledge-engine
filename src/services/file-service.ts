import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config/env.js";

const BASE = path.resolve(config.STORAGE_PATH);

export class FileService {
  constructor() {
    const dirs = ["files", "markdown", "images"];
    for (const dir of dirs) {
      const p = path.join(BASE, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  /** Save uploaded file, returns storage path relative to BASE */
  async saveUpload(buffer: Buffer, fileName: string): Promise<{ filePath: string; fileSize: number }> {
    const ext = path.extname(fileName);
    const storedName = `${randomUUID()}${ext}`;
    const relativePath = path.join("files", storedName);
    const fullPath = path.join(BASE, relativePath);
    fs.writeFileSync(fullPath, buffer);
    return { filePath: relativePath, fileSize: buffer.length };
  }

  /** Save parsed markdown content */
  async saveMarkdown(documentId: string, version: number, content: string): Promise<string> {
    const relativePath = path.join("markdown", documentId, `v${version}`, "content.md");
    const fullPath = path.join(BASE, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    return relativePath;
  }

  /** Save images extracted during parsing */
  async saveImage(documentId: string, version: number, imageName: string, buffer: Buffer): Promise<string> {
    const relativePath = path.join("images", documentId, `v${version}`, imageName);
    const fullPath = path.join(BASE, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return relativePath;
  }

  /** Read file content from storage */
  readFile(relativePath: string): Buffer {
    return fs.readFileSync(path.join(BASE, relativePath));
  }

  /** Read markdown content */
  readMarkdown(relativePath: string): string {
    return fs.readFileSync(path.join(BASE, relativePath), "utf8");
  }

  /** Delete document files (all versions) */
  deleteDocumentFiles(documentId: string): void {
    const markdownDir = path.join(BASE, "markdown", documentId);
    const imagesDir = path.join(BASE, "images", documentId);
    for (const dir of [markdownDir, imagesDir]) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  /** Get full path for streaming, with path traversal protection */
  getFullPath(relativePath: string): string {
    const full = path.join(BASE, relativePath);
    if (!full.startsWith(BASE)) {
      throw new Error("Invalid file path");
    }
    return full;
  }
}

export const fileService = new FileService();
