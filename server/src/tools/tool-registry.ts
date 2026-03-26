import { Tool } from '../types/index.js';
import { GetContextTool } from './get-context-tool.js';
import { GetMediaAnalysesTool } from './get-media-analyses-tool.js';
import { GetProfileTool } from './get-profile-tool.js';
import { InspectMediaTool } from './inspect-media-tool.js';
import { ListRecentMediaTool } from './list-recent-media-tool.js';
import { LogMealTool } from './log-meal-tool.js';
import { LogTrainingTool } from './log-training-tool.js';
import { SearchExerciseVideosTool } from './search-exercise-videos-tool.js';
import { SearchKnowledgeTool } from './search-knowledge-tool.js';
import { SearchMessageHistoryTool } from './search-message-history-tool.js';
import { SetProfileTool } from './set-profile-tool.js';

export function createDefaultTypedTools(): Tool[] {
  return [
    new GetContextTool(),
    new GetProfileTool(),
    new SetProfileTool(),
    new ListRecentMediaTool(),
    new InspectMediaTool(),
    new LogMealTool(),
    new LogTrainingTool(),
    new SearchExerciseVideosTool(),
    new SearchKnowledgeTool(),
    new SearchMessageHistoryTool(),
    new GetMediaAnalysesTool(),
  ];
}
