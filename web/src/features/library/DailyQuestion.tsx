// Home's "A past question a day": in the six weeks before your next exam, one tagged past question from that
// module, the same for everyone that day, opening its paper at the question's page.
import { ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { inDays, type DayKey } from '../../lib/dates';
import { Button, PageSection, Panel, SectionHeader } from '../../ui';
import { AddToBoard } from '../board/public';
import { DAILY_WINDOW_DAYS, dailyQuestion } from './daily';
import { sittingLabel, zoneLabel } from '../../lib/exams';
import { questionHref, useModuleQuestions } from './papers';
import './DailyQuestion.css';

export interface DailyQuestionProps {
  moduleId: string;
  moduleName: string;
  /** days until the module's exam */
  examDays: number;
  /** today in Bahrain */
  day: DayKey;
  className?: string;
}

/**
 * Nothing at all outside the six weeks, while the switches are off, while it loads, when it fails or while the module
 * has too few tagged questions: it's an extra, not a feed.
 */
export function DailyQuestion({ moduleId, moduleName, examDays, day, className }: DailyQuestionProps) {
  const { featureOn } = useAuth();
  const on = featureOn('library') && featureOn('library.questions') && featureOn('library.daily-question') && examDays >= 0 && examDays <= DAILY_WINDOW_DAYS;
  const questions = useModuleQuestions(moduleId, { enabled: on });
  const q = on && questions.data ? dailyQuestion(questions.data, day) : null;
  if (!q) return null;
  const p = q.paper;
  const sitting = p.examYear ? [sittingLabel(p.examYear, p.examSession), p.zone ? zoneLabel(p.zone) : null].filter(Boolean).join(', ') : p.title;
  return (
    <PageSection className={className} aria-labelledby="home-daily" data-hub="daily-question">
      <SectionHeader id="home-daily" title="A past question a day" />
      <Panel as="div" className="lib-daily">
        <p className="lib-daily__meta">
          {moduleName} · exam {inDays(examDays)}
        </p>
        <p className="lib-daily__q">
          <span className="u-tabular">Question {q.question}</span>, {sitting}
          {q.page ? <span className="lib-daily__page u-tabular"> (p. {q.page})</span> : null}
        </p>
        <p className="lib-daily__chapter">On {q.chapterTitle}. A new one tomorrow.</p>
        <div className="lib-daily__actions">
          <Button size="sm" variant="primary" to={questionHref(q)} trailingIcon={ArrowRight} data-hub="daily-open">
            Open the question
          </Button>
          {featureOn('board') ? <AddToBoard link={{ type: 'library_item', id: p.id }} /> : null}
        </div>
      </Panel>
    </PageSection>
  );
}
