import { registerDecorator, ValidationArguments, ValidationOptions } from "class-validator";

const customerStatuses = [
  "new",
  "active",
  "qualified",
  "follow_up",
  "converted",
  "not_interested",
  "blocked"
] as const;

const directions = ["incoming", "outgoing"] as const;
const senderTypes = ["customer", "bot", "agent", "system"] as const;

export type CustomerStatus = (typeof customerStatuses)[number];
export type MessageDirection = (typeof directions)[number];
export type SenderType = (typeof senderTypes)[number];

export const CUSTOMER_STATUSES = [...customerStatuses];
export const MESSAGE_DIRECTIONS = [...directions];
export const SENDER_TYPES = [...senderTypes];

export function IsJsonRecord(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "isJsonRecord",
      target: object.constructor,
      propertyName: String(propertyName),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value));
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be an object`;
        }
      }
    });
  };
}
