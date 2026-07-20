import { Customer, CustomerAttribute } from "@prisma/client";
import { parseJson } from "../common/json.util";

export type CustomerView = Omit<Customer, "interests" | "metadata"> & {
  interests: string[];
  metadata: Record<string, unknown>;
  messageCount?: number;
};

export type AttributeView = Omit<CustomerAttribute, "value"> & {
  value: unknown;
};

export function toCustomerView(
  customer: Customer & { _count?: { messages?: number } }
): CustomerView {
  return {
    ...customer,
    interests: parseJson<string[]>(customer.interests, []),
    metadata: parseJson<Record<string, unknown>>(customer.metadata, {}),
    messageCount: customer._count?.messages
  };
}

export function toAttributeView(attribute: CustomerAttribute): AttributeView {
  return {
    ...attribute,
    value: parseJson<unknown>(attribute.value, attribute.value)
  };
}
