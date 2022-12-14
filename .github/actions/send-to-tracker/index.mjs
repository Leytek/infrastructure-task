import core from '@actions/core';
import github from '@actions/github';
import exec from '@actions/exec';
import fetch from 'node-fetch';

const host = 'https://api.tracker.yandex.net';
const token = core.getInput('oauth-token');
const orgId = core.getInput('org-id');
const ticketId = core.getInput('ticket-id');
const tag = core.getInput('tag');
const url = `${host}/v2/issues/${ticketId}`;

const getCommandOutput = async (command) => {

  core.info(`Exec "${command}"`);
  let str = '';
  const code = await exec.exec(command, [], {
    listeners: {
      stdout: (data) => {
        str += data.toString();
      }
    }
  });
  core.info(`Command "${command}" complete, exit code: ${code}`);
  return str;
};

const handleResponse = async (response) => {
  response = await response;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  core.info(`Request success`);
};

const getTags = async () => {
  const tags = (await getCommandOutput('git tag -l')).trimEnd().split('\n');
  core.info(`Received tags: ${tags}`);
  return tags;
};

const getCommits = async () => {
  const tags = await getTags();
  let range = '';
  if (tags.length > 1)
    range = `${tags.at(-2)}..${tag}`;

  const commits = await getCommandOutput(`git log ${range} --pretty=format:"%h -- %an -- %s"`);
  core.info(`Received commits: ${commits}`);
  return commits;
};

const sendTicketInfo = async () => {
  const date = new Date().toLocaleDateString('en-US');
  const summary = `Релиз ${tag} - ${date}`;
  const commits = await getCommits();
  const description = `Ответственный за релиз ${github.context.actor}
    Коммиты, попавшие в релиз:
    ${commits}`;

  const options = {
    method: 'patch',
    headers: {
      Authorization: `OAuth ${token}`,
      'X-Org-ID': orgId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: summary,
      description: description
    }),
  };
  core.info(`Send ticket info`);
  return handleResponse(fetch(url, options));
};

const sendComment = () => {
  const options = {
    method: 'post',
    headers: {
      Authorization: `OAuth ${token}`,
      'X-Org-ID': orgId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: `Собрали образ с тэгом: ${tag}`,
    }),
  };
  core.info(`Send comment`);
  return handleResponse(fetch(url + '/comments', options));
};

const sendToTracker = async () => {
  try {
    await sendTicketInfo();
    await sendComment();
  } catch(e) {
    core.setFailed(e.message);
  }
};

await sendToTracker();
