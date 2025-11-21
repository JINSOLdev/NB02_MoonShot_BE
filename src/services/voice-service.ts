// services/voice-service.ts
import prisma from '../config/db';
import { task_status } from '@prisma/client';
import { createProjectWithMember } from '../repositories/project-repository';
import { parseKoreanDate } from '../utils/nlp/korean-date-parser';

export class VoiceService {
  /** 1) 음성으로 프로젝트 생성 */
  async createProjectFromVoice(text: string, requesterId: number) {
    const name = this.extractHash(text); // #프로젝트명
    if (!name) throw new Error('프로젝트명을 #태그로 말해주세요. 예) "프로젝트 #띄자인 만들자"');

    // 동일 이름 프로젝트 존재 여부: 생성자 기준으로 검사
    const existed = await prisma.projects.findFirst({
      where: { name, creatorId: requesterId },
      select: { id: true },
    });
    if (existed) throw new Error(`동일한 프로젝트명이 이미 있습니다: ${name}`);

    const created = await createProjectWithMember({
      creatorId: requesterId,
      name,
      description: this.extractDescription(text),
    });

    return { projectId: created.id, name: created.name };
  }

  private addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  /** 2) 음성으로 태스크 생성 */
  async createTaskFromVoice(requesterId: number, text: string) {
    const parsed = await this.parse(text, requesterId);

    if (!parsed.projectId) {
      throw new Error('프로젝트를 찾을 수 없습니다. "#프로젝트명"을 포함해서 말해주세요.');
    }

    const now = new Date();
    const due = parsed.dueDate ?? this.addDays(now, 1);

    const created = await prisma.tasks.create({
      data: {
        projectId: parsed.projectId,
        title: parsed.title,
        description: parsed.description ?? undefined, // 스키마상 선택 필드
        status: 'todo' as task_status, // 소문자 enum
        userId: parsed.assigneeId ?? requesterId, // 필수
        startedAt: now, // 필수
        dueDate: due, // 필수
      },
      select: { id: true },
    });

    return { created, parsed, unresolved: parsed.unresolvedMentions };
  }

  /** 3) 음성으로 하위태스크 생성 */
  async createSubTaskFromVoice(requesterId: number, text: string) {
    const { parentTaskId, subTitle } = this.parseForSubtask(text);

    const parent = await prisma.tasks.findUnique({ where: { id: parentTaskId } });
    if (!parent) throw new Error(`상위 태스크(id=${parentTaskId})를 찾을 수 없습니다.`);

    const created = await prisma.subtasks.create({
      data: {
        taskId: parentTaskId,
        description: subTitle, // Subtasks.description 은 필수
        // userId: (원하면 멘션 파싱해서 지정) 없으면 생략
      },
      select: { id: true, taskId: true },
    });

    return { subtaskId: created.id, parentTaskId: created.taskId };
  }

  /** 공통 파싱 로직 (태스크용) */
  private async parse(
    text: string,
    requesterId: number
  ): Promise<{
    projectId: number | null;
    title: string;
    description?: string;
    dueDate: Date | undefined;
    assigneeId: number | null;
    unresolvedMentions: string[];
  }> {
    // #프로젝트명 → 해당 유저가 만든 프로젝트 또는 멤버인 프로젝트에서 탐색
    const projectName = this.extractHash(text);
    let projectId: number | null = null;

    if (projectName) {
      // 1) 내가 만든 프로젝트에서 우선 검색
      const owned = await prisma.projects.findFirst({
        where: { name: projectName, creatorId: requesterId },
        select: { id: true },
      });
      if (owned) projectId = owned.id;
      else {
        // 2) 프로젝트 멤버십으로도 검색
        const member = await prisma.project_members.findFirst({
          where: { userId: requesterId, project: { name: projectName } },
          select: { projectId: true },
        });
        projectId = member?.projectId ?? null;
      }
    }

    // 멘션(@이름) → 프로젝트 멤버 or 전체 유저에서 탐색
    const assigneeMentions = this.extractMentions(text);
    const { resolvedIds, unresolved } = await this.resolveMentions(assigneeMentions, projectId);

    const dueDate = parseKoreanDate(text);
    const title = this.extractTitle(text);
    const description = this.extractDescription(text);

    return {
      projectId,
      title,
      description: description || undefined,
      dueDate,
      assigneeId: resolvedIds[0] ?? null, // 1명만 담당자로
      unresolvedMentions: unresolved,
    };
  }

  /** 하위태스크용 파싱: "태스크 #1234 하위 'FE 버튼 정렬'" 형태 */
  private parseForSubtask(text: string) {
    const idFromHash = this.extractNumericHash(text); // #1234
    const parentTaskId = idFromHash ?? this.extractParentTaskIdByQuotedTitle(text);
    if (!parentTaskId)
      throw new Error(`상위 태스크 식별자를 찾지 못했습니다. (예: "태스크 #1234 하위 ...")`);

    const subTitle = this.extractQuoted(text) ?? this.extractTitle(text);
    const dueDate = parseKoreanDate(text); // 현재 스키마에 마감 없음(참고용)

    return { parentTaskId, subTitle, dueDate };
  }

  /** 멘션 → userId 해석 (프로젝트 맥락이 있으면 그 프로젝트 멤버에서 우선 탐색) */
  private async resolveMentions(mentions: string[], projectId: number | null) {
    if (!mentions.length) return { resolvedIds: [] as number[], unresolved: [] as string[] };

    const resolvedIds: number[] = [];
    const unresolved: string[] = [];

    for (const name of mentions) {
      let user = null;

      if (projectId) {
        // 프로젝트 멤버 중에서 이름 일치
        const member = await prisma.project_members.findFirst({
          where: { projectId, user: { name } },
          select: { userId: true },
        });
        if (member) {
          user = { id: member.userId };
        }
      }

      // 없으면 전체 유저에서 이름으로
      if (!user) {
        const found = await prisma.users.findFirst({
          where: { name },
          select: { id: true },
        });
        if (found) user = found;
      }

      if (user) resolvedIds.push(user.id);
      else unresolved.push(name);
    }

    return { resolvedIds, unresolved };
  }

  /** ===== 텍스트 추출 유틸 ===== */
  private extractHash(text: string) {
    const m = text.match(/#([^\s'"]+)/); // #프로젝트명
    return m?.[1];
  }
  private extractNumericHash(text: string) {
    const m = text.match(/#(\d{1,10})/); // #1234
    return m ? Number(m[1]) : null;
  }
  private extractQuoted(text: string) {
    const m = text.match(/['“”"‘’](.+?)['“”"‘’]/); // 따옴표 안
    return m?.[1];
  }
  private extractParentTaskIdByQuotedTitle(text: string) {
    const title = this.extractQuoted(text);
    if (!title) return null;
    // 필요 시 제목으로 parent 검색 로직 추가
    return null;
  }
  private extractMentions(text: string) {
    return [...text.matchAll(/@([^\s,]+)/g)].map((m) => m[1]);
  }
  private extractTitle(text: string) {
    return text
      .replace(/#([^\s,]+)/g, '')
      .replace(/@([^\s,]+)/g, '')
      .replace(/내일|모레|다음주|이번주|오늘|오전\s?\d+시|오후\s?\d+시/g, '')
      .replace(/[,\s]+/g, ' ')
      .trim();
  }
  private extractDescription(text: string) {
    return text.replace(/#([^\s,]+)/g, '').trim();
  }
}
