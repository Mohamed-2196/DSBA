// Home's "A past question a day": in the six weeks before your next exam, one tagged past question from that
// module, the same for everyone that day, opening its paper at the question's page. The API picks it (GET /home): it
// comes only while the switches are on, in those six weeks, and once the module has enough tagged questions.
import type { PaperQuestion } from '../../api/types';
import { useAuth } from '../../auth';
import { inDays } from '../../lib/dates';
import { Button, DocThumb, Icon, PageSection, Panel, SectionHeader, glyph } from '../../ui';
import { AddToBoard } from '../board/public';
import { paperLabel } from '../../lib/exams';
import { answerHref, questionHref, questionNumber } from './papers';
import './DailyQuestion.css';

export interface DailyQuestionProps {
  /** the day's question */
  question: PaperQuestion;
  /** the module of the exam it is for */
  moduleName: string;
  /** days until that exam */
  examDays: number;
  className?: string;
}

export function DailyQuestion({ question: q, moduleName, examDays, className }: DailyQuestionProps) {
  const { featureOn } = useAuth();
  const p = q.paper;
  const sitting = paperLabel(p);
  return (
    <PageSection className={className} aria-labelledby="home-daily" data-hub="daily-question">
      <SectionHeader id="home-daily" title="A past question a day" />
      <Panel as="div" className="lib-daily">
        <p className="lib-daily__meta">
          {moduleName} · exam {inDays(examDays)}
        </p>
        <p className="lib-daily__q">
          <span className="u-tabular">Question {questionNumber(q)}</span>, {sitting}
          {q.page ? <span className="lib-daily__page u-tabular"> (p. {q.page})</span> : null}
        </p>
        <p className="lib-daily__chapter">On {q.chapterTitle}. A new one tomorrow.</p>
        <div className="lib-daily__actions">
          <Button
            size="sm"
            variant="primary"
            to={questionHref(q)}
            trailingIcon={<Icon glyph={glyph.forward} />}
            data-hub="daily-open"
          >
            Open the question
          </Button>
          {q.answer ? (
            <Button
              size="sm"
              variant="secondary"
              to={answerHref(q.answer)}
              leadingIcon={<DocThumb tone="report" size="sm" />}
              data-hub="daily-answer"
            >
              Worked answer
            </Button>
          ) : null}
          {featureOn('board') ? <AddToBoard link={{ type: 'library_item', id: p.id }} /> : null}
        </div>
      </Panel>
    </PageSection>
  );
}
