import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { config } from "../config/env.js";
import type { UserRecord } from "../types.js";

function hash(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 260000, 64, "sha256").toString("hex");
}

export interface TokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  constructor(private readonly secret: string = config.AUTH_SECRET) {}

  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString("hex");
    const h = hash(password, salt);
    return `${salt}:${h}`;
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, h] = stored.split(":");
    if (!salt || !h) return false;
    return hash(password, salt) === h;
  }

  async generateToken(payload: TokenPayload): Promise<string> {
    return jwt.sign(payload, this.secret, {
      expiresIn: `${config.AUTH_TOKEN_EXPIRY_HOURS}h`,
    });
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    return jwt.verify(token, this.secret) as TokenPayload;
  }

  async register(email: string, password: string, displayName?: string): Promise<UserRecord> {
    const existing = await pool.query("select id from users where email = $1", [email]);
    if (existing.rows.length > 0) {
      throw new Error("Email already registered");
    }
    const id = randomUUID();
    const passwordHash = await this.hashPassword(password);
    const result = await pool.query(
      `insert into users (id, email, password_hash, display_name)
       values ($1, $2, $3, $4)
       returning id, email, display_name, created_at, updated_at`,
      [id, email, passwordHash, displayName || email.split("@")[0]]
    );
    return userFromRow(result.rows[0]);
  }

  async login(email: string, password: string): Promise<{ user: UserRecord; token: string }> {
    const result = await pool.query("select * from users where email = $1", [email]);
    if (result.rows.length === 0) {
      throw new Error("Invalid email or password");
    }
    const row = result.rows[0];
    const valid = await this.verifyPassword(password, row.password_hash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }
    const user = userFromRow(row);
    const token = await this.generateToken({ userId: user.id, email: user.email });
    return { user, token };
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const result = await pool.query("select * from users where id = $1", [userId]);
    if (result.rows.length === 0) return null;
    return userFromRow(result.rows[0]);
  }
}

function userFromRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: String(row.display_name || ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export const authService = new AuthService();
