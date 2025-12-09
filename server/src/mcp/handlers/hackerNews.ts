import type { HandlerConfig, HandlerContext } from '../types.js';
import { getDataset } from '../../data/datasets.js';

export function handleHackerNewsStory(
  _handlerConfig: HandlerConfig,
  args: Record<string, unknown>,
  _ctx: HandlerContext
): unknown {
  const storyId = String(args.id ?? '');

  if (!storyId) {
    return { error: 'Story ID is required' };
  }

  const data = getDataset('data/api/hackernews_stories.json');
  if (!data) {
    return { error: 'HackerNews data not available' };
  }

  const stories = (data as { stories?: Record<string, unknown> }).stories ?? {};
  const story = stories[storyId] as Record<string, unknown> | undefined;

  if (!story) {
    return { error: `Story ${storyId} not found` };
  }

  return {
    id: story.id,
    title: story.title,
    url: story.url,
    author: story.author,
    points: story.points,
    num_comments: story.num_comments,
    age: story.age,
    discussion_url: story.discussion_url,
  };
}
