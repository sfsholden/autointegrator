module.exports = app => {
  app.log("We're live");

  app.on('pull_request.closed', async (context) => {
    const { merged, base, merge_commit_sha, number } = context.payload.pull_request;
    console.log(context.payload.sender.login);
    if (merged && base.ref === 'master') {
      console.log(`Creating a backport PR for develop\nSHA: ${merge_commit_sha}`);
      const github = await app.auth();
      const resp = await github.apps.createInstallationToken({
        installation_id: context.payload.installation.id
      });
      if (resp.status === 201) {
        const head = `develop-port-${number}`;
        setupRepo(resp.data.token);
        cherryPick(head, merge_commit_sha);
        try {
          const { owner, repo } = context.repo();
          const newPr = await context.github.pulls.create({
            owner,
            repo,
            title: `Port #${number} to develop`,
            head,
            base: 'develop',
            body: `Port changes made in #${number} to the develop branch`,
          });

          const { sender } = context.payload;
          context.github.issues.createComment({
            issue_number: number,
            owner,
            repo,
            body: `Thanks @${sender.login} 👍, I was able to make a merge PR [here](${newPr.data.html_url}).`
          });
        } catch (err) {
          app.log(err);
          context.github.issues.createComment({
            issue_number: number,
            owner,
            repo,
            body: 'Had trouble making a merge PR 😓.'
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

function cherryPick(head, merge_commit_sha) {
  const { exec, cd, rm } = require('shelljs'); 
  exec('git checkout upstream/develop');
  exec(`git checkout -b ${head}`);
  exec(`git cherry-pick ${merge_commit_sha}`);
  exec(`git push upstream ${head}`);
  cd('..');
  rm('-rf', 'salesforcedx-templates');
}