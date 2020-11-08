declare namespace Express {
    export interface Request {
        user?: { [key: string]: string | boolean }
    }
}
