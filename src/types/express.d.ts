import { IUser } from '../models/User';
import { CustomResponse } from '../middleware/error';

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
            rawBody?: Buffer;
        }

        interface Response extends CustomResponse { }
    }
}