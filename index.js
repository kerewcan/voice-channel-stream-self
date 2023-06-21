console.time('Started App')
import { Client, Collection } from 'discord.js-selfbot-v13';
import { DiscordStreamClient } from 'discord-stream-client';
import parser from "iptv-playlist-parser";
import YoutubeClient from "y2mate-api";
const Youtube = new YoutubeClient();
const suspend = (...args) => import('ntsuspend').then(({ suspend }) => suspend(...args));
const resume = (...args) => import('ntsuspend').then(({ resume }) => resume(...args));
import fetch from 'node-fetch';
import { inspect } from 'util';


const client = new Client({
    checkUpdate: false,
});
client.botSettings = {
    token: '',
    prefix: ";;", owners: [], devMode: false,
    defaultM3U: "https://cdn.discordapp.com/attachments/1101231778313814027/1106974893444182066/tv_channels_sabriminariglu.m3u"
}

new DiscordStreamClient(client);
client.connections = new Collection();
client.commands = new Collection();
client.streamChannels = [];

var commands = [
    {
        settings: { name: "help" },
        run: async ({ client, message, args }) => {
            return message.channel.send('```Valid Commands:\n\n> ' + client.commands.filter((code) => code.settings.name !== "help" && code.settings.category !== "admin").map(({ settings: { name } }) => `${client.botSettings.prefix}${name}`).join(' <-> ') + ' <```')
        }
    },
    {
        settings: { name: "eval", category: "admin" },
        run: async ({ client, message, args }) => {
            if(!client.botSettings.owners.includes(message.author.id)) return;
            new Promise((resolve, reject) => resolve(eval(args.join(" ")))).then((output) => {
                if(typeof output !== "string") {
                    output = inspect(output, { compact: false, depth: 0, breakLength: 80 }); 
                    output = clean(output);
                }
                return message.channel.send("```js\n"+output+"```").catch(err => { console.info(output); message.channel.send('mesaj 2000 karakterden büyük, konsola logladım.') })
            }).catch(err => {
                var error = clean(err)
                return message.channel.send("```js\n"+error+"```")
            })
        }
    },
    {
        settings: { name: "dev", category: "admin" },
        run: async ({ client, message, args }) => {
            if(!client.botSettings.owners.includes(message.author.id)) return;
            client.botSettings.devMode = !client.botSettings.devMode;
            return message.channel.send('Ayarlandı')
        }
    },
    {
        settings: { name: "tv" },
        run: async ({ client, message, args: [channel] }) => {
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            if(!channel) return message.channel.send('kanal numarası gır')
            let { player, stream, ...other } = client.connections.get(message.guild.id)
            if(player) player.stop()
            
            let url = client.streamChannels[channel].url

            const newPlayer = client.streamClient.createPlayer(url, stream.udp);
            newPlayer.play();
            newPlayer.once('finish', () => {
                client.connections.set(`${message.guild.id}.player`, null)
            });
            client.connections.set(message.guild.id, { ...other, stream, player: newPlayer, url })
        }
    },
    {
        settings: { name: "m3u" },
        run: async ({ client, message, args: [url] }) => {
            if(!client.botSettings.owners.includes(message.author.id)) return;
            if(!url) return message.channel.send('m3u url gir')

            const data = await fetch(url);
            const content = await data.text();

            client.streamChannels = parser.parse(content).items;
            return message.channel.send('m3u yüklendi')
        }
    },
    {
        settings: { name: "twitch" },
        run: async ({ client, message, args: [streamer] }) => {
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            if(!streamer) return message.channel.send('yayıncı gir')
            if(!message.member.voice) return message.channel.send('kanalda bulunmalısın')
            if(!message.guild.channels.cache.has(message.member.voice.channelId)) return message.channel.send('kanalı bulamadım')

            let data = await fetch('https://pwn.sh/tools/streamapi.py?url=twitch.tv%2F' + streamer);
            data = await data.json();
            let { success, urls: { [Object.keys(data.urls).pop()]: url } } = data;

            if(!success) return message.channel.send('yayıncı yayın yapmıyor veya sistemde bir hata var.')

            let { player, stream, ...other } = client.connections.get(message.guild.id) || {};
            if(player) player.stop()

            const newPlayer = client.streamClient.createPlayer(url, stream.udp);
            newPlayer.play();
            newPlayer.once('finish', () => {
                client.connections.set(`${message.guild.id}.player`, null)
            });
            client.connections.set(message.guild.id, { ...other, stream, player: newPlayer, url })
        }
    },
    {
        settings: { name: "youtube" },
        run: async ({ client, message, args: [url] }) => {
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            if(!url) return message.channel.send('video url gir')
            if(!message.member.voice) return message.channel.send('kanalda bulunmalısın')
            if(!message.guild.channels.cache.has(message.member.voice.channelId)) return message.channel.send('kanalı bulamadım')

            let streamLink;
            let { page, linksVideo, videos } = await Youtube.getFromURL(url, "vi");
            if (page == "detail") {
                streamLink = await linksVideo.get("auto").fetch();
            } else if (page == "playlist") {
                let video = await videos[0].fetch();
                streamLink = await video.linksVideo.get("auto").fetch();
            }
            streamLink = streamLink.downloadLink;
            if(!streamLink) return message.channel.send('videoyu bulurken hata oldu.')

            let { player, stream, ...other } = client.connections.get(message.guild.id) || {};
            if(player) player.stop()

            const newPlayer = client.streamClient.createPlayer(streamLink, stream.udp);
            newPlayer.play();
            newPlayer.once('finish', () => {
                client.connections.set(`${message.guild.id}.player`, null)
            });
            client.connections.set(message.guild.id, { ...other, stream, player: newPlayer, url })
        }
    },
    {
        settings: { name: "join" },
        run: async ({ client, message, args }) => {
            if(!message.member.voice) return message.channel.send('kanalda bulunmalısın')
            if(!message.guild.channels.cache.has(message.member.voice.channelId)) return message.channel.send('kanalı bulamadım')
            //if(args.length < 1) return message.channel.send('bir link belirtmelisin')
            const voiceConnection = await client.streamClient.joinVoiceChannel(message.guild.channels.cache.get(message.member.voice.channelId), {
                selfDeaf: false,
                selfMute: false,
                selfVideo: false,
            })
            const streamConnection = await voiceConnection.createStream();
            client.connections.set(message.guild.id, { voice: voiceConnection, stream: streamConnection, player: null, url: null });
        }
    },
    {
        settings: { name: "stop" },
        run: async ({ client, message }) => {
            await client.streamClient.leaveVoiceChannel()
            client.connections.delete(message.guild.id);
        }
    },
    {
        settings: { name: "play" },
        run: async ({ client, message, args: [url] }) => {
            if(!message.member.voice) return message.channel.send('kanalda bulunmalısın')
            if(!message.guild.channels.cache.has(message.member.voice.channelId)) return message.channel.send('kanalı bulamadım')
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            if(!url) return message.channel.send('bir link belirtmelisin')

            let { player, stream, ...other } = client.connections.get(message.guild.id)
            if(player) player.stop()

            const newPlayer = client.streamClient.createPlayer(url, stream.udp);
            newPlayer.play();
            newPlayer.once('finish', () => {
                client.connections.set(`${message.guild.id}.player`, null)
            });
            client.connections.set(message.guild.id, { ...other, stream, player: newPlayer, url })
        }
    },
    {
        settings: { name: "resume" },
        run: async ({ client, message, args }) => {
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            const { command } = client.connections.get(message.guild.id).player
            if(!command.ffmpegProc) return; 
            if(process.platform === "win32") resume(command.ffmpegProc.pid);
            else command.ffmpegProc.kill('SIGCONT')
        }
    },
    {
        settings: { name: "pause" },
        run: async ({ client, message, args }) => {
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            const { command } = client.connections.get(message.guild.id).player
            if(!command.ffmpegProc) return; 
            if(process.platform === "win32") suspend(command.ffmpegProc.pid);
            else command.ffmpegProc.kill('SIGSTOP')
        }
    },
    {
        settings: { name: "seek" },
        run: async ({ client, message, args: [seek] }) => {
            // yapılmadı
            seek = seek.replace(/\./g, ':')
            /*console.log(seek)
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')
            if(!seek)  return message.channel.send('süre girmelisin')
            const { command } = client.connections.get(message.guild.id).player
            command.setStartTime(seek)*/

            if(seek == "30") {

            } else if(seek == "5") {

            }

            if(!message.member.voice) return message.channel.send('kanalda bulunmalısın')
            if(!message.guild.channels.cache.has(message.member.voice.channelId)) return message.channel.send('kanalı bulamadım')
            if(!client.connections.has(message.guild.id)) return message.channel.send('yayın yapmıyorum')

            let { player, stream, url, ...other } = client.connections.get(message.guild.id)
            if(player) player.stop()

            const newPlayer = client.streamClient.createPlayer(url, stream.udp);
            newPlayer.play();
            newPlayer.once('finish', () => {
                client.connections.set(`${message.guild.id}.player`, null)
            });
            client.connections.set(message.guild.id, { ...other, stream, player: newPlayer, url })
        }
    }
]

function clean(text) {
    if (typeof(text) === "string")
        return text.replace(/`/g, "`" + String.fromCharCode(8203)).replace(/@/g, "@" + String.fromCharCode(8203));
    else
        return text;
}

client.on('ready', async () => {
    client.user.setStatus('invisible');
    console.timeEnd('Started App')
    console.log('')
    console.log('ID:          ' + client.user.id)
    console.log('Username:    ' + client.user.tag)
    console.log('')

    commands.forEach(command => client.commands.set(command.settings.name, command))

    console.log('Valid Commands:')
    console.log('')
    console.log(client.commands.map(command => client.botSettings.prefix + command.settings.name).join(' / '))

    
    const data = await fetch(client.botSettings.defaultM3U);
    const content = await data.text();

    client.streamChannels = parser.parse(content).items;
})

client.on('messageCreate', async (message) => {
    if(!message.content.startsWith(client.botSettings.prefix)) return;
    if(client.botSettings.devMode && !client.botSettings.owners.includes(message.author.id)) return;

    let [command, ...args] = message.content.slice(client.botSettings.prefix.length).split(/ +/g)
    if(!client.commands.has(command)) return;
    command = client.commands.get(command);
    command.run({ client, message, args });
})


client.login(client.botSettings.token);