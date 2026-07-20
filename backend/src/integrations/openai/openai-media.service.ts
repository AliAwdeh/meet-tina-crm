import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "node:fs";
import OpenAI from "openai";

@Injectable()
export class OpenaiMediaService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(realValue(this.config.get<string>("OPENAI_API_KEY")));
  }

  async transcribeAudio(localPath: string): Promise<{ configured: boolean; text: string | null }> {
    const client = this.client();
    if (!client) return { configured: false, text: null };
    const response = await client.audio.transcriptions.create({
      file: createReadStream(localPath),
      model: this.config.get<string>("OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-transcribe"
    });
    return { configured: true, text: response.text ?? null };
  }

  async describeImage(imageUrl: string): Promise<{ configured: boolean; text: string | null }> {
    const client = this.client();
    if (!client) return { configured: false, text: null };
    const response = await client.responses.create({
      model: this.config.get<string>("OPENAI_VISION_MODEL") ?? "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Summarize this WhatsApp image for chatbot context." },
            { type: "input_image", image_url: imageUrl, detail: "auto" }
          ]
        }
      ]
    });
    return { configured: true, text: response.output_text ?? null };
  }

  private client(): OpenAI | null {
    const apiKey = realValue(this.config.get<string>("OPENAI_API_KEY"));
    return apiKey ? new OpenAI({ apiKey }) : null;
  }
}

function realValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "change-me" && trimmed !== "..." ? trimmed : null;
}
