import {animate, state, style, transition, trigger,} from '@angular/animations';
import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {faCheckCircle, faTimesCircle} from '@fortawesome/free-regular-svg-icons';
import {ModalDismissReasons, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import * as $ from 'jquery';
import * as _ from 'lodash';
import {CookieService} from 'ngx-cookie-service';
import * as card_data from 'src/json-against-humanity/full.md.json';
import * as uuid from 'uuid';

import {Message} from '../../message';
import {SocketService} from '../socket.service';

interface Player {
  id: string;
  name: string;
  score: number;
  czar: boolean;
  playedCards: string[];
}

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css'],
})
export class GameComponent implements OnInit {
  title = 'Cards Against Isolation';
  gameId = 'abc123';
  playerId: string;
  playerName: string;
  players: Player[] = [];
  randomizedPlayers: Player[] = [];
  playersById: any = {};
  myCards: string[] = [];
  blackCard: string;
  playedCards: string[] = [];
  cardsToPlay: number;
  cardsPlayed: any = {};
  waiting: any[] = [];
  cards = {
    black: [],
    white: [],
  };
  game: any = {
    players: [],
  };
  czar = '';
  decks = ['Base', 'Box'];

  constructor(private route: ActivatedRoute, private router: Router, private cookie: CookieService, private socket: SocketService, private modalService: NgbModal) {}

  ngOnInit() {
    this.playerId = this.getPlayerId();
    this.initIoConnection();
    this.gameId = this.route.snapshot.paramMap.get('id');
  }

  initIoConnection(): void {
    this.socket.connect();
    this.socket.onConnect().subscribe(() => {
      this.myCards = [];
      this.playedCards = [];
      this.socket.send({
        event: 'join_game',
        player: this.playerId,
        game: this.gameId,
      });
    });
    this.socket.onMessage().subscribe((message: Message) => {
      if (message.event == 'game_update') {
        for (const player of this.game.players) {
          for (const newplayer of message.game.players) {
            if (newplayer.id != player.id) continue;
            if (newplayer.score != player.score) {
              console.log(`Score for ${newplayer.name} is now ${newplayer.score}`);
            }
          }
        }
        this.game = message.game;

        // Update players.
        for (const player of this.game.players) {
          if (player.id != this.playerId) continue;
          this.playerName = player.name;
          this.myCards = player.cards;
        }
        this.players = this.game.players;
        this.randomizedPlayers = _.shuffle(this.game.players);
        this.playersById = {};
        for (const player of this.players) {
          this.playersById[player.id] = player;
        }

        // Update black card.
        this.blackCard = this.game.blackCard;
        this.cardsToPlay = (this.game.blackCard.match(/_/g) || []).length || 1;
        this.cardsPlayed = {};

        this.updateWaiting();
        this.czar = this.game.czar;

        if (this.game.state == 'choose_winner') {
          this.playedCards = [];
        }

      } else if (message.event == 'invalid_game') {
        this.router.navigate([`/create`]);
      } else if (message.event == 'draw_card') {
        this.myCards.push(message.card);
      } else if (message.event == 'play_card') {
        this.cardsPlayed[message.player] = message.cards;
        this.updateWaiting();
      } else {
        console.log(`Unknown message`, message);
      }
    });
  }

  public updateWaiting() {
    this.waiting = [];
    for (const player of this.players) {
      if (player.czar) continue;
      if (player.playedCards.length != this.cardsToPlay) {
        this.waiting.push(player);
      }
    }
  }

  fontSize(text: string): string {
    if (text.length > 150) {
      return '13pt';
    };
    if (text.length > 125) {
      return '14pt';
    };
    if (text.length > 100) {
      return '15pt';
    };
    if (text.length > 75) {
      return '16pt';
    };
    if (text.length > 50) {
      return '17pt';
    };
    if (text.length > 20) {
      return '18pt';
    };
    return '20pt';
  }

  newBlackCard() {
    const card = this.cards.black[0];
    this.blackCard = card;
    this.cardsToPlay = (card.match(/_/g) || []).length || 1;
  }

  getWhiteCards() {
    const cards = _.sampleSize(this.cards.white, 10 - this.myCards.length);
    for (const card of cards) {
      this.myCards.push(card);
    }
  }

  playCard(card: string) {
    if (this.playedCards.length && _.includes(this.playedCards, card)) {
      return;
    }
    this.playedCards.push(card);
    if (this.playedCards.length > this.cardsToPlay) {
      this.playedCards = this.playedCards.slice(1, this.cardsToPlay + 1);
    }
    this.socket.send({
      event: 'play_card',
      game: this.gameId,
      player: this.playerId,
      cards: this.playedCards,
    });
  }

  getPlayerId(): string {
    let id = this.cookie.get('player-id');
    if (!id) {
      id = uuid.v4();
      this.cookie.set('player-id', id);
    }
    return id;
  }

  chooseWinner(playerId: string): void {
    this.socket.send({
      event: 'choose_winner',
      player: this.playerId,
      winner: playerId,
      game: this.gameId,
    });
  }

  endThisRound(): void {
    this.socket.send({
      event: 'end_round',
      player: this.playerId,
      game: this.gameId,
    });
  }

  editName(modal) {
    this.modalService.open(modal).result.then(result => {
      if (result == 'save') {
        this.socket.send({
          event: 'set_player_name',
          player: this.playerId,
          game: this.gameId,
          text: this.playerName,
        });
      }
    });
    return false;
  }

  kickPlayer(id: string) {
    this.socket.send({
      event: 'kick_player',
      player: this.playerId,
      winner: id,
      game: this.gameId,
    });
    return false;
  }

  flipCard(player: string, card: string) {
    console.log(`Flipping player ${player} card "${card}"`);
  }

  waitIcon(id: string): any {
    for (const player of this.waiting) {
      if (player.id == id) return faTimesCircle;
    }
    return faCheckCircle;
  }
}