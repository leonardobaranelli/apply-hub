import { Injectable } from '@nestjs/common';
import {
  ApplicationStage,
  ApplicationStatus,
} from './application.enums';

/**
 * Resolves a sensible default `stage` from a `status` when the client
 * does not provide one explicitly. Reduces friction when moving an
 * application through the pipeline.
 */
@Injectable()
export class StatusResolverService {
  defaultStageFor(status: ApplicationStatus): ApplicationStage {
    switch (status) {
      case ApplicationStatus.APPLIED:
        return ApplicationStage.SUBMITTED;
      case ApplicationStatus.ACKNOWLEDGED:
        return ApplicationStage.AUTO_REPLY;
      case ApplicationStatus.SCREENING:
        return ApplicationStage.RECRUITER_SCREEN;
      case ApplicationStatus.ASSESSMENT:
        return ApplicationStage.TAKE_HOME;
      case ApplicationStatus.INTERVIEW:
        return ApplicationStage.TECH_INTERVIEW_1;
      case ApplicationStatus.OFFER:
        return ApplicationStage.OFFER_RECEIVED;
      case ApplicationStatus.NEGOTIATING:
        return ApplicationStage.OFFER_NEGOTIATION;
      case ApplicationStatus.ACCEPTED:
        return ApplicationStage.OFFER_ACCEPTED;
      case ApplicationStatus.REJECTED:
      case ApplicationStatus.WITHDRAWN:
      case ApplicationStatus.GHOSTED:
      case ApplicationStatus.ON_HOLD:
        return ApplicationStage.CLOSED;
      default:
        return ApplicationStage.SUBMITTED;
    }
  }

  /**
   * Indicates whether moving from `from` to `to` represents the "first
   * response" (relevant for response-rate and time-to-response metrics).
   */
  isFirstResponseTransition(
    from: ApplicationStatus,
    to: ApplicationStatus,
  ): boolean {
    if (from !== ApplicationStatus.APPLIED) return false;
    return to !== ApplicationStatus.APPLIED && to !== ApplicationStatus.GHOSTED;
  }

  /**
   * Indicates whether the destination status closes the application
   * pipeline.
   */
  isClosingTransition(to: ApplicationStatus): boolean {
    return (
      to === ApplicationStatus.ACCEPTED ||
      to === ApplicationStatus.REJECTED ||
      to === ApplicationStatus.WITHDRAWN ||
      to === ApplicationStatus.GHOSTED
    );
  }
}
