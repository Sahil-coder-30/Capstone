import { Router } from 'express';
import { getPreferencesController, updatePreferencesController } from '../controllers/preferences.controller.js';

const preferencesRouter = Router();

preferencesRouter.get('/', getPreferencesController);
preferencesRouter.put('/', updatePreferencesController);

export default preferencesRouter;
