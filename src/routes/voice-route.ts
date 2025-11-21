import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { VoiceController } from '../controllers/voice-controller';

const router = Router();
const voicecontroller = new VoiceController();

router.post('/projects', authenticate, voicecontroller.createProjectFromVoice);

router.post('/tasks', authenticate, voicecontroller.createTaskFromVoice);

router.post('/subtasks', authenticate, voicecontroller.createSubTaskFromVoice);

export default router;
