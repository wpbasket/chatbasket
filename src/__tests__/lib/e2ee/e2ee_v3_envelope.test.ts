// Real libsodium (WASM build) behind the react-native-libsodium API surface.
jest.mock('react-native-libsodium', () => {
    const sodium = require('libsodium-wrappers-sumo');
    return {
        __esModule: true,
        get ready() { return sodium.ready; },
        get base64_variants() { return sodium.base64_variants; },
        crypto_box_keypair: () => sodium.crypto_box_keypair(),
        crypto_box_easy: (m: any, n: any, pk: any, sk: any) => sodium.crypto_box_easy(m, n, pk, sk),
        crypto_box_open_easy: (c: any, n: any, pk: any, sk: any) => sodium.crypto_box_open_easy(c, n, pk, sk),
        crypto_box_seal: (m: any, pk: any) => sodium.crypto_box_seal(m, pk),
        crypto_box_seal_open: (c: any, pk: any, sk: any) => sodium.crypto_box_seal_open(c, pk, sk),
        crypto_secretbox_keygen: () => sodium.crypto_secretbox_keygen(),
        crypto_secretbox_easy: (m: any, n: any, k: any) => sodium.crypto_secretbox_easy(m, n, k),
        crypto_secretbox_open_easy: (c: any, n: any, k: any) => sodium.crypto_secretbox_open_easy(c, n, k),
        randombytes_buf: (len: number) => sodium.randombytes_buf(len),
        from_base64: (s: string, v?: number) => sodium.from_base64(s, v),
        to_base64: (b: any, v?: number) => sodium.to_base64(b, v),
        to_string: (b: any) => sodium.to_string(b),
    };
});

import {
    decryptPayloadEnvelope,
    encryptPayloadEnvelope,
    generateIdentityKeypair,
    generateMediaKey,
    isV3Envelope,
    parseV3Envelope,
    sodiumReady,
} from '@/lib/personalLib/e2ee/e2ee.crypto';

const textPayload = { type: 'text' as const, text: 'hello multi-device 🔐' };

describe('E2EE V3 payload envelope', () => {
    beforeAll(async () => {
        await sodiumReady();
    });

    it('decrypts the same text payload on every listed device', () => {
        const senderCurrent = generateIdentityKeypair();
        const senderSibling = generateIdentityKeypair();
        const recipientOne = generateIdentityKeypair();
        const recipientTwo = generateIdentityKeypair();

        const wire = encryptPayloadEnvelope(textPayload, [
            senderCurrent.publicKey,
            senderSibling.publicKey,
            recipientOne.publicKey,
            recipientTwo.publicKey,
        ]);

        expect(decryptPayloadEnvelope(wire, senderCurrent.publicKey, senderCurrent.privateKey)).toEqual(textPayload);
        expect(decryptPayloadEnvelope(wire, senderSibling.publicKey, senderSibling.privateKey)).toEqual(textPayload);
        expect(decryptPayloadEnvelope(wire, recipientOne.publicKey, recipientOne.privateKey)).toEqual(textPayload);
        expect(decryptPayloadEnvelope(wire, recipientTwo.publicKey, recipientTwo.privateKey)).toEqual(textPayload);
    });

    it('rejects an unlisted device', () => {
        const recipient = generateIdentityKeypair();
        const outsider = generateIdentityKeypair();
        const wire = encryptPayloadEnvelope(textPayload, [recipient.publicKey]);

        expect(() => decryptPayloadEnvelope(wire, outsider.publicKey, outsider.privateKey)).toThrow('[E2EE] v3 envelope missing device key');
    });

    it('dedupes duplicate public keys and ignores invalid public keys', () => {
        const recipient = generateIdentityKeypair();
        const wire = encryptPayloadEnvelope(textPayload, [recipient.publicKey, recipient.publicKey, 'bad-key']);
        const parsed = parseV3Envelope(wire);

        expect(parsed.key_envelopes).toHaveLength(1);
        expect(parsed.key_envelopes[0]?.public_key).toBe(recipient.publicKey);
        expect(decryptPayloadEnvelope(wire, recipient.publicKey, recipient.privateKey)).toEqual(textPayload);
    });

    it('rejects tampered ciphertext', () => {
        const recipient = generateIdentityKeypair();
        const parsed = parseV3Envelope(encryptPayloadEnvelope(textPayload, [recipient.publicKey]));
        parsed.ciphertext = parsed.ciphertext.replace(/.$/, parsed.ciphertext.endsWith('A') ? 'B' : 'A');

        expect(() => decryptPayloadEnvelope(JSON.stringify(parsed), recipient.publicKey, recipient.privateKey)).toThrow();
    });

    it('encrypts and decrypts file payload metadata plus file key', () => {
        const recipient = generateIdentityKeypair();
        const fileKey = generateMediaKey();
        const sodium = require('libsodium-wrappers-sumo');
        const fileKeyB64 = sodium.to_base64(fileKey, sodium.base64_variants.ORIGINAL);
        const payload = {
            type: 'file' as const,
            file_key: fileKeyB64,
            file_name: 'photo.jpg',
            mime_type: 'image/jpeg',
            size: 12345,
            caption: 'summer',
        };

        const wire = encryptPayloadEnvelope(payload, [recipient.publicKey]);

        expect(decryptPayloadEnvelope(wire, recipient.publicKey, recipient.privateKey)).toEqual(payload);
    });

    it('detects only V3 JSON envelopes', () => {
        const recipient = generateIdentityKeypair();
        const wire = encryptPayloadEnvelope(textPayload, [recipient.publicKey]);

        expect(isV3Envelope(wire)).toBe(true);
        expect(isV3Envelope('{"v":2,"kind":"cb.media"}')).toBe(false);
        expect(isV3Envelope('plain text')).toBe(false);
        expect(isV3Envelope(null)).toBe(false);
    });
});
