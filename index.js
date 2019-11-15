/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  app.log("We're live");

  app.on('pull_request.closed', async (context) => {
    const { merged, base, merge_commit_sha, number } = context.payload.pull_request;
    if (merged && base.ref === 'master') {
      console.log(`Creating a backport PR for develop\nSHA: ${merge_commit_sha}`);
      const github = await app.auth();
      const resp = await github.apps.createInstallationToken({ installation_id: context.payload.installation.id });
      if (resp.status === 201) {
        setupRepo(resp.data.token);
        cherryPick(merge_commit_sha);
        const { owner, repo } = context.repo();
        try {
          const newPr = await context.github.pulls.create({
            owner,
            repo,
            title: `Port ${number} to develop`,
            head: `develop-port-${number}`,
            base: 'develop',
            body: `Port changes made in #${number} to the develop branch`,
          });
          context.github.issues.createComment({
            issue_number: number,
            owner,
            repo,
            body: `Went ahead and made a merge PR [here](${newPr.data.html_url}) for ya 👍.`
          });
          context.github.pulls.revi
        } catch (err) {
          context.github.issues.createComment({
            issue_number: number,
            owner,
            repo,
            body: "Had trouble making a merge PR 😓, looks like you'll have to resolve some conflicts."
          });
        }
      }
    }
  });
}

function setupRepo(token) {
  const { exec, cd } = require('shelljs');
  const url = `https://sfdx-backport:${token}@github.com/brpowell/salesforcedx-templates.git`;
  exec(`git clone ${url}`);
  cd('salesforcedx-templates');
  exec(`git remote add upstream ${url}`);
  exec(`git fetch upstream develop`);
}

function cherryPick(merge_commit_sha) {
  const { exec, cd, rm } = require('shelljs');  
  exec('git checkout upstream/develop');
  exec(`git checkout -b ${branch}`);
  exec(`git cherry-pick ${merge_commit_sha}`);
  exec(`git push upstream ${branch}`);
  cd('..');
  rm('-rf', 'salesforcedx-templates');
}