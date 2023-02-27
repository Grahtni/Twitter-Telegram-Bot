require("dotenv").config();
const { Bot, HttpError, GrammyError } = require("grammy");
const twitterGetUrl = require("twitter-url-direct");
const path = require("path");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

/// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply("*Welcome!* ✨\n_Send a tweet._", {
      parse_mode: "Markdown",
    })
    .then(console.log(`New user added:`, ctx.from))
    .catch((error) => console.error(error));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot downloads media from tweets.\nSend a link to a tweet to try it out!_",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.from.id))
    .catch((error) => console.error(error));
});

// Messages

bot.on("msg", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.msg.text}`
  );
  // Logic
  if (ctx.msg.text.includes("t.co")) {
    await ctx.reply("*Short links are not supported presently.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  } else if (!ctx.msg.text.includes("twitter" && "https")) {
    await ctx.reply("*Send a valid Tweet.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  } else {
    const statusMessage = await ctx.reply(`*Downloading*`, {
      parse_mode: "Markdown",
    });
    async function deleteMessageWithDelay(fromId, messageId, delayMs) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          bot.api
            .deleteMessage(fromId, messageId)
            .then(() => resolve())
            .catch((error) => reject(error));
        }, delayMs);
      });
    }
    await deleteMessageWithDelay(ctx.from.id, statusMessage.message_id, 3000);
    try {
      let response = await twitterGetUrl(ctx.msg.text);
      async function removeTcoLinks(tweetText) {
        const tcoRegex = /https?:\/\/t\.co\/\w+/gi;
        const cleanedText = tweetText.replace(tcoRegex, "");
        return cleanedText;
      }
      console.log(response);
      if (response.found && response.type === "image") {
        const postDesc = await removeTcoLinks(response.tweet_user.text);
        await ctx.replyWithPhoto(response.download, {
          caption: `*${postDesc}*\n_By_ [${response.tweet_user.name}](https://twitter.com/${response.tweet_user.username})`,
          parse_mode: "Markdown",
        });
      } else if (response.found && response.type === "video/gif") {
        const sortedDownload = response.download.sort((a, b) => {
          return (
            parseInt(b.dimension.split("x")[0]) -
            parseInt(a.dimension.split("x")[0])
          );
        });
        const highestQuality = sortedDownload[0];
        const postDesc = await removeTcoLinks(response.tweet_user.text);
        console.log(highestQuality.url);
        await ctx.replyWithVideo(highestQuality.url, {
          caption: `*${postDesc}*\n_By_ [${response.tweet_user.name}](https://twitter.com/${response.tweet_user.username})`,
          parse_mode: "Markdown",
        });
      } else {
        return;
      }
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.message.includes("Forbidden: bot was blocked by the user")) {
          console.log("Bot was blocked by the user");
        } else if (error.message.includes("Call to 'sendVideo' failed!")) {
          console.log("Error sending video");
          await ctx.reply(`*Error contacting Twitter.*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        } else {
          await ctx.reply(`*An error occurred: ${error.message}*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        }
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log(`An error occured:`, error);
        await ctx.reply(
          `*An error occurred. Are you sure you sent a valid Twitter link?*\n_Error: ${error.message}_`,
          { parse_mode: "Markdown", reply_to_message_id: ctx.msg.message_id }
        );
        return;
      }
    }
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

bot.start();
