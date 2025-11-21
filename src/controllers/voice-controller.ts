import { Request, Response, NextFunction } from 'express';
import { VoiceService } from '../services/voice-service';

export class VoiceController {
  private service = new VoiceService();

  // 프로젝트 생성 (음성)
  createProjectFromVoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number((req.user as any)?.id);
      const { text } = req.body as { text: string };

      const created = await this.service.createProjectFromVoice(text, userId);
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  };

  // 태스크 생성 (음성)
  createTaskFromVoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number((req.user as any)?.id);
      const { text } = req.body as { text: string };

      const created = await this.service.createTaskFromVoice(userId, text);
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  };

  // 하위 태스크 생성 (음성)
  createSubTaskFromVoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number((req.user as any)?.id);
      const { text } = req.body as { text: string };

      const created = await this.service.createSubTaskFromVoice(userId, text);
      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  };
}
