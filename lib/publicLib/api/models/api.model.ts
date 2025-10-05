export class ApiError extends Error {
    code: number;
    type: string;
    data: any;

    constructor(message: string, code: number, type: string, data: any) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.type = type;
        this.data = data;
    }
}