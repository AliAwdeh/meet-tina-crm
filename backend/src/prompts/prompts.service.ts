import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { Prisma, Prompt, PromptVersion } from "@prisma/client";
import { stringifyJson } from "../common/json.util";
import { PrismaService } from "../database/prisma.service";
import { ActivatePromptDto, CreatePromptDto, PromptListQueryDto, PromptVariableDto, TestPromptDto, UpdatePromptDto } from "./dto/prompt.dto";
import { fallbackPromptContent, promptDefaults } from "./prompt-defaults";

type PromptResponse = Omit<Prompt, "variables" | "metadata" | "usage"> & {
  variables: PromptVariableDto[];
  metadata: Record<string, unknown>;
  usage: unknown[];
};

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly cacheTtlMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults().catch(() => undefined);
  }

  async seedDefaults(): Promise<void> {
    for (const prompt of promptDefaults) {
      const existing = await this.prisma.prompt.findUnique({ where: { key: prompt.key } });
      if (existing) continue;
      await this.prisma.prompt.create({
        data: {
          key: prompt.key,
          name: prompt.name,
          description: prompt.description,
          category: prompt.category,
          content: prompt.content,
          version: 1,
          status: "active",
          isActive: true,
          model: prompt.model,
          temperature: prompt.temperature,
          maxTokens: prompt.maxTokens,
          responseFormat: prompt.responseFormat,
          variables: stringifyJson(prompt.variables, "[]"),
          metadata: stringifyJson(prompt.metadata ?? {}, "{}"),
          usage: stringifyJson(prompt.usage, "[]"),
          versions: {
            create: {
              version: 1,
              content: prompt.content,
              model: prompt.model,
              temperature: prompt.temperature,
              maxTokens: prompt.maxTokens,
              responseFormat: prompt.responseFormat,
              variables: stringifyJson(prompt.variables, "[]"),
              metadata: stringifyJson(prompt.metadata ?? {}, "{}"),
              changeNote: "Seeded from fallback prompt defaults.",
              createdBy: "system"
            }
          },
          createdBy: "system",
          updatedBy: "system"
        }
      });
    }
  }

  async listPrompts(query: PromptListQueryDto): Promise<{ data: unknown[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const where: Prisma.PromptWhereInput = {};
    if (query.search) {
      where.OR = [
        { key: { contains: query.search } },
        { name: { contains: query.search } },
        { description: { contains: query.search } }
      ];
    }
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.model) where.model = query.model;

    const [data, total] = await Promise.all([
      this.prisma.prompt.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.prompt.count({ where })
    ]);

    return {
      data: data.map((prompt) => this.toResponse(prompt)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 }
    };
  }

  async getPromptById(id: string): Promise<unknown> {
    const prompt = await this.prisma.prompt.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" } } }
    });
    if (!prompt) {
      throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
    }
    return {
      ...this.toResponse(prompt),
      versions: prompt.versions.map((version) => this.versionToResponse(version)),
      usages: parseJson(prompt.usage, [])
    };
  }

  async getPrompt(key: string): Promise<unknown> {
    const prompt = await this.prisma.prompt.findUnique({ where: { key } });
    if (!prompt) {
      throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
    }
    return this.toResponse(prompt);
  }

  async getActivePrompt(key: string): Promise<unknown> {
    const prompt = await this.getActivePromptRecord(key);
    return this.toResponse(prompt);
  }

  async getActivePromptContent(key: string, fallback?: string): Promise<{ content: string; version: number; key: string; source: "database" | "fallback"; model?: string | null; temperature?: number | null; maxTokens?: number | null }> {
    try {
      const prompt = await this.getActivePromptRecord(key);
      return {
        content: prompt.content,
        version: prompt.version,
        key: prompt.key,
        source: "database",
        model: prompt.model,
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens
      };
    } catch {
      const content = fallback ?? fallbackPromptContent(key);
      if (!content) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: `Prompt ${key} was not found.` });
      return { content, version: 0, key, source: "fallback" };
    }
  }

  async renderPrompt(key: string, variables: Record<string, unknown>): Promise<{ key: string; version: number; rendered: string }> {
    const prompt = await this.getActivePromptRecord(key);
    return { key: prompt.key, version: prompt.version, rendered: renderTemplate(prompt.content, variables, parseVariables(prompt.variables)) };
  }

  async createPrompt(dto: CreatePromptDto): Promise<unknown> {
    const variables = dto.variables ?? inferVariableDefinitions(dto.content);
    try {
      const prompt = await this.prisma.prompt.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description,
          category: dto.category ?? "Other",
          content: dto.content,
          version: 1,
          status: dto.status ?? "draft",
          isActive: dto.status === "active",
          model: dto.model,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
          responseFormat: dto.responseFormat,
          variables: stringifyJson(variables, "[]"),
          metadata: stringifyJson(dto.metadata ?? {}, "{}"),
          usage: stringifyJson(dto.usage ?? [], "[]"),
          updatedBy: dto.updatedBy,
          createdBy: dto.updatedBy,
          versions: {
            create: {
              version: 1,
              content: dto.content,
              model: dto.model,
              temperature: dto.temperature,
              maxTokens: dto.maxTokens,
              responseFormat: dto.responseFormat,
              variables: stringifyJson(variables, "[]"),
              metadata: stringifyJson(dto.metadata ?? {}, "{}"),
              changeNote: dto.changeNote ?? "Initial prompt version.",
              createdBy: dto.updatedBy
            }
          }
        }
      });
      this.invalidateCache(prompt.key);
      return this.toResponse(prompt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "PROMPT_KEY_EXISTS", message: "Prompt key already exists." });
      }
      throw error;
    }
  }

  async updatePrompt(id: string, dto: UpdatePromptDto): Promise<unknown> {
    const current = await this.prisma.prompt.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
    const nextVersion = current.version + 1;
    const content = dto.content ?? current.content;
    const variables = dto.variables ?? parseVariables(current.variables);
    const updated = await this.prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.update({
        where: { id },
        data: {
          key: dto.key ?? current.key,
          name: dto.name ?? current.name,
          description: dto.description === undefined ? current.description : dto.description,
          category: dto.category ?? current.category,
          content,
          version: nextVersion,
          status: dto.status ?? current.status,
          isActive: (dto.status ?? current.status) === "active",
          model: dto.model === undefined ? current.model : dto.model,
          temperature: dto.temperature === undefined ? current.temperature : dto.temperature,
          maxTokens: dto.maxTokens === undefined ? current.maxTokens : dto.maxTokens,
          responseFormat: dto.responseFormat === undefined ? current.responseFormat : dto.responseFormat,
          variables: stringifyJson(variables, "[]"),
          metadata: stringifyJson(dto.metadata ?? parseJson(current.metadata, {}), "{}"),
          usage: stringifyJson(dto.usage ?? parseJson(current.usage, []), "[]"),
          updatedBy: dto.updatedBy
        }
      });
      await tx.promptVersion.create({
        data: {
          promptId: id,
          version: nextVersion,
          content,
          model: prompt.model,
          temperature: prompt.temperature,
          maxTokens: prompt.maxTokens,
          responseFormat: prompt.responseFormat,
          variables: prompt.variables,
          metadata: prompt.metadata,
          changeNote: dto.changeNote ?? "Prompt updated.",
          createdBy: dto.updatedBy
        }
      });
      return prompt;
    });
    this.invalidateCache(updated.key);
    return this.toResponse(updated);
  }

  async activateVersion(promptId: string, dto: ActivatePromptDto): Promise<unknown> {
    if (!dto.versionId) {
      const prompt = await this.prisma.prompt.update({ where: { id: promptId }, data: { status: "active", isActive: true, updatedBy: dto.updatedBy } });
      this.invalidateCache(prompt.key);
      return this.toResponse(prompt);
    }
    return this.restoreVersion(promptId, dto.versionId, dto.changeNote ?? "Activated selected version.", dto.updatedBy);
  }

  async restoreVersion(promptId: string, versionId: string, changeNote = "Restored previous prompt version.", updatedBy?: string): Promise<unknown> {
    const [prompt, version] = await Promise.all([
      this.prisma.prompt.findUnique({ where: { id: promptId } }),
      this.prisma.promptVersion.findUnique({ where: { id: versionId } })
    ]);
    if (!prompt || !version || version.promptId !== promptId) {
      throw new NotFoundException({ code: "PROMPT_VERSION_NOT_FOUND", message: "Prompt version was not found." });
    }
    const nextVersion = prompt.version + 1;
    const updated = await this.prisma.$transaction(async (tx) => {
      const restored = await tx.prompt.update({
        where: { id: promptId },
        data: {
          content: version.content,
          version: nextVersion,
          status: "active",
          isActive: true,
          model: version.model,
          temperature: version.temperature,
          maxTokens: version.maxTokens,
          responseFormat: version.responseFormat,
          variables: version.variables,
          metadata: version.metadata,
          updatedBy
        }
      });
      await tx.promptVersion.create({
        data: {
          promptId,
          version: nextVersion,
          content: version.content,
          model: version.model,
          temperature: version.temperature,
          maxTokens: version.maxTokens,
          responseFormat: version.responseFormat,
          variables: version.variables,
          metadata: version.metadata,
          changeNote,
          createdBy: updatedBy
        }
      });
      return restored;
    });
    this.invalidateCache(updated.key);
    return this.toResponse(updated);
  }

  async getVersionHistory(promptId: string): Promise<unknown[]> {
    const exists = await this.prisma.prompt.findUnique({ where: { id: promptId }, select: { id: true } });
    if (!exists) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
    const versions = await this.prisma.promptVersion.findMany({ where: { promptId }, orderBy: { version: "desc" } });
    return versions.map((version) => this.versionToResponse(version));
  }

  async getUsages(promptId: string): Promise<unknown[]> {
    const prompt = await this.prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
    return parseJson(prompt.usage, []);
  }

  async testPrompt(dto: TestPromptDto): Promise<unknown> {
    const started = Date.now();
    const prompt = await this.promptForTest(dto);
    const variableDefinitions = dto.variableDefinitions ?? parseVariables(prompt.variables);
    const variables = {
      ...(dto.variables ?? {}),
      sample_customer_message: dto.sampleMessage ?? "",
      sample_conversation_history: dto.sampleHistory ?? ""
    };
    const renderedPrompt = renderTemplate(dto.content ?? prompt.content, variables, variableDefinitions);
    const model = dto.model ?? prompt.model ?? this.config.get<string>("OPENAI_TEST_MODEL") ?? "gpt-4o-mini";
    const response = await this.safeModelTest(model, renderedPrompt, dto.sampleMessage, dto.temperature ?? prompt.temperature ?? 0.2, dto.maxTokens ?? prompt.maxTokens ?? 800);
    return {
      safeMode: true,
      destructiveToolsExecuted: false,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      model,
      renderedPrompt,
      response: response.text,
      structuredOutput: null,
      toolCallProposals: [],
      tokenUsage: response.usage,
      latencyMs: Date.now() - started,
      parsingErrors: []
    };
  }

  invalidateCache(key?: string): void {
    if (!key) {
      this.cache.clear();
      return;
    }
    this.cache.delete(`active:${key}`);
  }

  private async getActivePromptRecord(key: string): Promise<Prompt> {
    const cacheKey = `active:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as Prompt;
    const prompt = await this.prisma.prompt.findUnique({ where: { key } });
    if (!prompt || !prompt.isActive || prompt.status !== "active") {
      throw new NotFoundException({ code: "PROMPT_NOT_ACTIVE", message: `Prompt ${key} is not active.` });
    }
    this.cache.set(cacheKey, { value: prompt, expiresAt: Date.now() + this.cacheTtlMs });
    return prompt;
  }

  private async promptForTest(dto: TestPromptDto): Promise<Prompt> {
    if (dto.promptId) {
      const prompt = await this.prisma.prompt.findUnique({ where: { id: dto.promptId } });
      if (!prompt) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
      return prompt;
    }
    if (dto.key) {
      const prompt = await this.prisma.prompt.findUnique({ where: { key: dto.key } });
      if (!prompt) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt was not found." });
      return prompt;
    }
    if (!dto.content) {
      throw new BadRequestException({ code: "PROMPT_TEST_CONTENT_REQUIRED", message: "Provide promptId, key, or content." });
    }
    return {
      id: "test",
      key: "test.unsaved",
      name: "Unsaved test prompt",
      description: null,
      category: "Other",
      content: dto.content,
      version: 0,
      status: "draft",
      isActive: false,
      model: dto.model ?? null,
      temperature: dto.temperature ?? null,
      maxTokens: dto.maxTokens ?? null,
      responseFormat: null,
      variables: stringifyJson(dto.variableDefinitions ?? inferVariableDefinitions(dto.content), "[]"),
      metadata: "{}",
      usage: "[]",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null
    };
  }

  private async safeModelTest(model: string, renderedPrompt: string, sampleMessage: string | undefined, temperature: number, maxTokens: number): Promise<{ text: string | null; usage: unknown }> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey || apiKey === "change-me") {
      return { text: "OpenAI API key is not configured. Rendered prompt validation completed only.", usage: null };
    }
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      temperature,
      max_output_tokens: maxTokens,
      input: [
        { role: "system", content: renderedPrompt },
        { role: "user", content: sampleMessage || "This is a safe dashboard prompt test. Do not call tools or modify external state." }
      ]
    });
    return { text: response.output_text ?? null, usage: response.usage ?? null };
  }

  private toResponse(prompt: Prompt): PromptResponse {
    return {
      ...prompt,
      variables: parseVariables(prompt.variables),
      metadata: parseJson(prompt.metadata, {}),
      usage: parseJson(prompt.usage, [])
    };
  }

  private versionToResponse(version: PromptVersion): unknown {
    return {
      ...version,
      variables: parseVariables(version.variables),
      metadata: parseJson(version.metadata, {})
    };
  }
}

export function renderTemplate(content: string, variables: Record<string, unknown>, definitions: PromptVariableDto[] = []): string {
  const placeholders = extractPlaceholders(content);
  const required = new Set([
    ...placeholders,
    ...definitions.filter((definition) => definition.required !== false).map((definition) => definition.name)
  ]);
  const missing = [...required].filter((key) => variables[key] === undefined || variables[key] === null || variables[key] === "");
  if (missing.length > 0) {
    throw new BadRequestException({
      code: "PROMPT_VARIABLES_MISSING",
      message: `Missing required prompt variables: ${missing.join(", ")}`
    });
  }
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => String(variables[key] ?? ""));
}

export function inferVariableDefinitions(content: string): PromptVariableDto[] {
  return extractPlaceholders(content).map((name) => ({ name, required: true, description: "Inferred from prompt template." }));
}

function extractPlaceholders(content: string): string[] {
  return Array.from(new Set([...content.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu)].map((match) => match[1])));
}

function parseVariables(value: string): PromptVariableDto[] {
  const parsed = parseJson<unknown[]>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
    .map((entry) => ({
      name: String(entry.name ?? ""),
      required: entry.required !== false,
      description: typeof entry.description === "string" ? entry.description : "",
      example: typeof entry.example === "string" ? entry.example : undefined
    }))
    .filter((entry) => entry.name.length > 0);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
