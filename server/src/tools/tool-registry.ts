import { Tool } from '../types/index.js';
import { GetContextTool } from './get-context-tool.js';
import { GetMediaAnalysesTool } from './get-media-analyses-tool.js';
import { GetProfileTool } from './get-profile-tool.js';
import { GetTrainingPlanTool } from './get-training-plan-tool.js';
import { InspectMediaTool } from './inspect-media-tool.js';
import { CompleteTrainingPlanExerciseTool } from './complete-training-plan-exercise-tool.js';
import { DeleteRecordTool } from './delete-record-tool.js';
import { ListRecentRecordsTool } from './list-recent-records-tool.js';
import { LogCheckInTool } from './log-check-in-tool.js';
import { LogMealTool } from './log-meal-tool.js';
import { LogTrainingTool } from './log-training-tool.js';
import { SearchExerciseTool } from './search-exercise-tool.js';
import { SearchKnowledgeTool } from './search-knowledge-tool.js';
import { SearchMessageHistoryTool } from './search-message-history-tool.js';
import { SetProfileTool } from './set-profile-tool.js';
import { SetTrainingPlanTool } from './set-training-plan-tool.js';
import { UpdateMealRecordTool } from './update-meal-record-tool.js';
import { UpdateTrainingRecordTool } from './update-training-record-tool.js';

export function createDefaultTypedTools(): Tool[] {
  return [
    new GetContextTool(),
    new GetProfileTool(),
    new SetProfileTool(),
    new GetTrainingPlanTool(),
    new SetTrainingPlanTool(),
    new CompleteTrainingPlanExerciseTool(),
    new LogCheckInTool(),
    new InspectMediaTool(),
    new LogMealTool(),
    new LogTrainingTool(),
    new ListRecentRecordsTool(),
    new UpdateMealRecordTool(),
    new UpdateTrainingRecordTool(),
    new DeleteRecordTool(),
    new SearchKnowledgeTool(),
    new SearchExerciseTool(),
    new SearchMessageHistoryTool(),
    new GetMediaAnalysesTool(),
  ];
}
