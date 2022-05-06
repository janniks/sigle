import { NextApiHandler } from 'next';
import * as Sentry from '@sentry/nextjs';
import { addDays, format, isBefore, isValid, parse } from 'date-fns';
import { getBucketUrl, getPublicStories } from './utils';
import { initFathomClient } from '../../../external/fathom';

const fathomClient = initFathomClient({
  apiToken: process.env.FATHOM_API_TOKEN!,
  entityId: process.env.FATHOM_ENTITY_ID!,
});

interface AnalyticsHistoricalParams {
  dateFrom?: string;
  dateGrouping?: 'day' | 'month';
}

interface AnalyticsHistoricalResponseError {
  error: string;
}

type AnalyticsHistoricalResponse = {
  date: string;
  visits: number;
  pageviews: number;
}[];

// TODO not more than const dateFrom = '2021-04-01';

export const analyticsHistoricalEndpoint: NextApiHandler<
  AnalyticsHistoricalResponseError | AnalyticsHistoricalResponse
> = async (req, res) => {
  let { dateFrom, dateGrouping } = req.query as AnalyticsHistoricalParams;

  if (!dateFrom) {
    res.status(400).json({ error: 'dateFrom is required' });
    return;
  }
  let parsedDateFrom = parse(dateFrom, 'yyyy-MM-dd', new Date());
  const isValidDate = isValid(parsedDateFrom);
  if (!isValidDate) {
    res.status(400).json({ error: 'dateFrom is invalid' });
    return;
  }

  if (!dateGrouping) {
    res.status(400).json({ error: 'dateGrouping is required' });
    return;
  }
  if (dateGrouping !== 'day' && dateGrouping !== 'month') {
    res.status(400).json({ error: 'dateGrouping must be day or month' });
    return;
  }

  // TODO protect to logged in users
  // TODO take username from session
  const username = 'sigleapp.id.blockstack';
  // TODO test what is happening with a date in the future
  const dateTo = new Date();

  const historicalResponse: AnalyticsHistoricalResponse = [];

  // As fathom does not return data for all the days, we need to add the missing days
  while (isBefore(parsedDateFrom, dateTo)) {
    const date = format(parsedDateFrom, 'yyyy-MM-dd');
    historicalResponse.push({
      date,
      visits: 0,
      pageviews: 0,
    });
    parsedDateFrom = addDays(parsedDateFrom, 1);
  }

  const { profile, bucketUrl } = await getBucketUrl({ req, username });
  if (!profile || !bucketUrl) {
    const errorId = Sentry.captureMessage(
      `No profile or bucketUrl for ${username}`
    );
    res.status(500).json({ error: `Internal server error: ${errorId}` });
    return;
  }

  const publicStoriesFile = await getPublicStories({ bucketUrl });
  const storiesPath = publicStoriesFile.map(
    (publicStory) => `/${username}/${publicStory.id}`
  );
  // Add the root path to the list of paths
  storiesPath.push(`/${username}`);

  // TODO batch with max concurrent limit
  const fathomAggregationResult = await Promise.all(
    storiesPath.map((path) =>
      fathomClient.aggregatePath({
        dateFrom,
        dateGrouping,
        path,
      })
    )
  );

  const datesValues: { [key: string]: { visits: number; pageviews: number } } =
    {};

  // Aggregate the results from fathom and sum the values by date
  fathomAggregationResult.forEach((aggregationResult) => {
    aggregationResult.forEach((result) => {
      if (!datesValues[result.date]) {
        datesValues[result.date] = { visits: 0, pageviews: 0 };
      }
      datesValues[result.date].visits += parseInt(result.visits, 10);
      datesValues[result.date].pageviews += parseInt(result.pageviews, 10);
    });
  });

  Object.keys(datesValues).forEach((date) => {
    const dateValues = datesValues[date];
    const index = historicalResponse.findIndex(
      (historical) => historical.date === date
    );
    if (index === -1) {
      const errorId = Sentry.captureMessage(
        `No index for date ${date} and username ${username}`
      );
      res.status(500).json({ error: `Internal server error: ${errorId}` });
      return;
    }
    historicalResponse[index].visits = dateValues.visits;
    historicalResponse[index].pageviews = dateValues.pageviews;
  });

  res.status(200).json(historicalResponse);
};

export default Sentry.withSentry(analyticsHistoricalEndpoint);
