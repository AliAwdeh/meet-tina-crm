import { Injectable } from "@nestjs/common";
import { stringifyJson } from "../common/json.util";
import { PrismaService } from "../database/prisma.service";
import { toAttributeView, AttributeView } from "./customer.mapper";
import { CustomersService } from "./customers.service";

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService
  ) {}

  async list(customerId: string): Promise<AttributeView[]> {
    await this.customers.ensureExists(customerId);
    const attributes = await this.prisma.customerAttribute.findMany({
      where: { customerId },
      orderBy: { key: "asc" }
    });
    return attributes.map(toAttributeView);
  }

  async upsert(
    customerId: string,
    key: string,
    value: unknown,
    valueType = inferValueType(value)
  ): Promise<AttributeView> {
    await this.customers.ensureExists(customerId);
    const attribute = await this.prisma.customerAttribute.upsert({
      where: { customerId_key: { customerId, key } },
      update: { value: stringifyJson(value, "\"\""), valueType },
      create: { customerId, key, value: stringifyJson(value, "\"\""), valueType }
    });
    return toAttributeView(attribute);
  }

  async bulkUpsert(customerId: string, attributes: Record<string, unknown>): Promise<AttributeView[]> {
    const keys = Object.keys(attributes);
    const results: AttributeView[] = [];
    for (const key of keys) {
      results.push(await this.upsert(customerId, key, attributes[key]));
    }
    return results;
  }

  async remove(customerId: string, key: string): Promise<{ success: true }> {
    await this.customers.ensureExists(customerId);
    await this.prisma.customerAttribute.delete({ where: { customerId_key: { customerId, key } } });
    return { success: true };
  }
}

function inferValueType(value: unknown): string {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object" && value !== null) return "json";
  return "string";
}
