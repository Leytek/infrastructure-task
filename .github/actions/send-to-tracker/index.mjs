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
  let str = '';
  await exec.exec(command, [], {
    listeners: {
      stdout: (data) => {
        str += data.toString();
      }
    }
  });
  return str;
};

const handleResponse = async (response) => {
  response = await response;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
};

const getTags = async () => {
  return (await getCommandOutput('git tag -l')).trimEnd().split('\n');
};

const getCommits = async () => {
  const tags = await getTags();
  let range = '';
  if (tags.length > 1)
    range = `${tags.at(-1)} .. ${tag}`;

  return getCommandOutput(`git log ${range} --pretty=format:"%h - %an - %s"`);
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

sendToTracker();
