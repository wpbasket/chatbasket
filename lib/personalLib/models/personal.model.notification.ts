// personal.model.notification.ts

// Token Type
export type TokenType = 'fcm' | 'apn';

// Register Token Payload
export interface RegisterTokenPayload {
  token: string;
  type: TokenType;
  device_name?: string;
}
