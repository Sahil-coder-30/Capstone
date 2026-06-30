import { Router } from 'express';
import { getProfileController, updateProfileController } from '../controllers/profile.controller.js';

const profileRouter = Router();

profileRouter.get('/', getProfileController);
profileRouter.put('/', updateProfileController);

export default profileRouter;
