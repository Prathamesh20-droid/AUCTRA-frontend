import Navbar from "../../components/Navbar";
import "./Auction.css";
import fallbackImg from "../../assets/images/PlAyer.png";
import { useEffect, useState, useRef, useCallback, useReducer } from "react";
import { socket } from "../../socket";
import { useNavigate } from "react-router-dom";
import { getImageUrl } from "../../Utils/constants";
import { useAuth } from "../../context/AuthContext";
import { API_BASE_URL } from "../../Utils/constants";

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = String(Math.floor(s / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatBidTime = (timeStr) => {
  if (!timeStr) return "";
  try {
    let parseable = String(timeStr).trim();
    if (!parseable.includes("T") && parseable.includes(" ")) {
      parseable = parseable.replace(" ", "T") + "Z";
    } else if (
      parseable.includes("T") &&
      !parseable.endsWith("Z") &&
      !parseable.includes("+") &&
      !parseable.slice(10).includes("-")
    ) {
      parseable += "Z";
    }
    const date = new Date(parseable);
    if (isNaN(date.getTime())) return String(timeStr);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return String(timeStr);
  }
};

const auctionReducer = (state, action) => {
  switch (action.type) {
    case "STATE":
      return {
        ...state,
        player: null,
        history: [],
        currentBid: 0,
        timer: 0,
        paused: false,
        loading: false
      };
    case "STATUS":
      return {
        ...state,
        player: action.player,
        currentBid: action.currentBid,
        history: Array.isArray(action.history) ? action.history : state.history,
        paused: Boolean(action.paused),
        timer: action.timer ?? state.timer,
        teamBalance: action.teamBalance !== undefined ? action.teamBalance : state.teamBalance,
        loading: false
      };

    case "STARTED":
      return {
        ...state,
        player: action.player,
        history: [],
        currentBid: action.currentBid,
        timer: action.timer,
        paused: false,
        loading: false
      };
    case "NO_ACTIVE":
      return {
        ...state,
        player: null,
        loading: false
      };
    case "UPDATE":
      return {
        ...state,
        currentBid: action.currentBid ?? state.currentBid,
        history: action.history ?? state.history
      };
    case "TIMER":
      return {
        ...state,
        timer: action.timer
      };
    case "PAUSE":
      return {
        ...state,
        paused: true,
        timer: action.timer
      };
    case "RESUME":
      return {
        ...state,
        paused: false,
        timer: action.timer
      };
    case "PURSE":
      return {
        ...state,
        teamBalance: action.purse
      };
    case "UNDO_SALE":
      return {
        ...state,
        history: [...state.history, action.entry]
      };
    default:
      return state;
  }
};

const Auction = () => {

  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [undoBanner, setUndoBanner] = useState(null);

  const [auction, dispatch] = useReducer(auctionReducer, {

    player: null,
    history: [],
    currentBid: 0,
    timer: 0,
    paused: false,
    teamBalance: Number(user?.team_purse ?? 0),
    loading: true
  });

  useEffect(() => {
    if (user?.team_purse !== undefined && user?.team_purse !== null) {
      dispatch({ type: "PURSE", purse: Number(user.team_purse) });
    }
  }, [user?.team_purse]);

  const [flashIndex, setFlashIndex] = useState(null);
  const audioRef = useRef(null);
  if (audioRef.current === null) {
    audioRef.current = new Audio(require("../../assets/Sounds/mixkit-software-interface-start-2574.wav"));
  }

  const MIN_INCREMENT = 500;

  const handleAuctionStatus = useCallback((data) => {
    if (data.status !== "auction_active") return;

    const base = Number(data.player.base_price);
    const current = Number(data.highest_bid?.bid_amount || base);

    let purse;
    if (data.team_purse !== undefined && data.team_purse !== null && Number(data.team_purse) > 0) {
      purse = Number(data.team_purse);
    } else if (user?.team_purse !== undefined && user?.team_purse !== null && Number(user.team_purse) > 0) {
      purse = Number(user.team_purse);
    }

    dispatch({
      type: "STATUS",
      player: data.player,
      currentBid: current,
      history: data.history || [],
      timer: data.remaining_seconds,
      paused: Boolean(data.paused),
      ...(purse !== undefined ? { teamBalance: purse } : {})
    });

  }, [user]);

  const handleAuctionState = useCallback((data) => {
    if (data.status === "no_active_auction") {
      dispatch({ type: "STATE" });
    }
  }, []);

  const handleAuctionStarted = useCallback((data) => {
    dispatch({
      type: "STARTED",
      player: data.player,
      currentBid: data.current_bid || data.player?.base_price,
      timer: data.duration
    });
  }, []);

  const handleAuctionUpdate = useCallback((data) => {
    dispatch({
      type: "UPDATE",
      currentBid: data.current_bid,
      history: data.history
    });
  }, []);

  const handleTimer = useCallback((data) => {
    dispatch({
      type: "TIMER",
      timer: data.remaining_seconds
    });
  }, []);

  const handlePaused = useCallback((data) => {
    dispatch({
      type: "PAUSE",
      timer: data.remaining_seconds
    });
  }, []);

  const handleResumed = useCallback((data) => {
    dispatch({
      type: "RESUME",
      timer: data.remaining_seconds
    });
  }, []);

  const handleEnded = useCallback((data) => {
    if (data.status === "sold") {
      navigate("/sold", { state: data });
    } else {
      navigate("/unsold", { state: data });
    }
  }, [navigate]);

  const handlePurseUpdate = useCallback((data) => {
    dispatch({
      type: "PURSE",
      purse: data.purse
    });
  }, []);

  const handleUndoSale = useCallback((data) => {
    console.log("undo_sale received:", data);
    const msg = data.message || `Sale of ${data.player_name || data.player?.name || "Player"} was reversed by Admin.`;
    setUndoBanner(msg);

    const entry = {
      id: `undo-${data.player_id}-${Date.now()}`,
      type: "undo_sale",
      is_undo: true,
      player_id: data.player_id,
      player_name: data.player_name || data.player?.name,
      team_name: data.team_name,
      bid_time: new Date().toISOString(),
      message: msg
    };

    dispatch({
      type: "UNDO_SALE",
      entry
    });

    setTimeout(() => {
      setUndoBanner((current) => (current === msg ? null : current));
    }, 10000);
  }, []);

  const handlersRef = useRef({});
  handlersRef.current = {
    handleAuctionStatus,
    handleAuctionStarted,
    handleAuctionUpdate,
    handleTimer,
    handlePaused,
    handleResumed,
    handleEnded,
    handlePurseUpdate,
    handleUndoSale,
    handleAuctionState
  };

  useEffect(() => {

    if (authLoading || !user) return;

    const joinAuction = () => {
      socket.emit("join_auction", {
        team_id: user.team_id
      });
    };

    if (socket.connected) {
      joinAuction();
    } else {
      socket.on("connect", joinAuction);
    }

    const onStatus = (data) => handlersRef.current.handleAuctionStatus(data);
    const onStarted = (data) => handlersRef.current.handleAuctionStarted(data);
    const onUpdate = (data) => handlersRef.current.handleAuctionUpdate(data);
    const onTimer = (data) => handlersRef.current.handleTimer(data);
    const onPaused = (data) => handlersRef.current.handlePaused(data);
    const onResumed = (data) => handlersRef.current.handleResumed(data);
    const onEnded = (data) => handlersRef.current.handleEnded(data);
    const onPurse = (data) => handlersRef.current.handlePurseUpdate(data);
    const onUndoSale = (data) => handlersRef.current.handleUndoSale(data);
    const onState = (data) => handlersRef.current.handleAuctionState(data);

    socket.on("auction_status", onStatus);
    socket.on("auction_started", onStarted);
    socket.on("auction_update", onUpdate);
    socket.on("timer_update", onTimer);
    socket.on("auction_paused", onPaused);
    socket.on("auction_resumed", onResumed);
    socket.on("auction_ended", onEnded);
    socket.on("purse_update", onPurse);
    socket.on("undo_sale", onUndoSale);
    socket.on("auction_state", onState);

    socket.on("bid_rejected", (msg) => {
      alert(msg?.error || "Bid rejected");
    });

    return () => {
      socket.off("connect", joinAuction);
      socket.off("auction_status", onStatus);
      socket.off("auction_started", onStarted);
      socket.off("auction_update", onUpdate);
      socket.off("timer_update", onTimer);
      socket.off("auction_paused", onPaused);
      socket.off("auction_resumed", onResumed);
      socket.off("auction_ended", onEnded);
      socket.off("purse_update", onPurse);
      socket.off("undo_sale", onUndoSale);
      socket.off("auction_state", onState);
      socket.off("bid_rejected");
    };

  }, [user, authLoading, navigate]);


  useEffect(() => {
    const el = document.querySelector(".notifications-list");
    if (el) el.scrollTop = el.scrollHeight;
  }, [auction.history]);
  const basePrice = auction.player?.base_price ?? 0;
  const currentBid = auction.currentBid ?? basePrice;

  useEffect(() => {

    if (!auction.history.length) return;

    const lastIndex = auction.history.length - 1;

    setFlashIndex(lastIndex);

    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } catch { }


    const timeout = setTimeout(() => {
      setFlashIndex(null);
    }, 1500);

    return () => clearTimeout(timeout);

  }, [auction.history]);

  // ---------------- BID FUNCTION ----------------

  const placeBid = (amount) => {

    if (auction.paused) return alert("Auction paused");

    const balance = Number(auction.teamBalance ?? 0);
    if (amount > balance) {
      return alert("Insufficient balance");
    }

    socket.emit("place_bid", {
      team_id: user.team_id,
      player_id: auction.player?.id,
      bid_amount: amount,
      token: localStorage.getItem("token")
    });
  };

  // ---------------- TIMER FORMAT ----------------

  if (auction.loading) return <p>Loading auction...</p>;

  if (!auction.player) {

    return (
      <div className="text-center mt-5">
        Waiting for next player...
      </div>
    );
  }

  const nextSteps = auction.player
  ? [
      currentBid + MIN_INCREMENT
    ]
  : [];
  console.log("Team purse:", user.team_purse)
  return (
    <>
      <Navbar />
      <div className="auction-bg d-flex flex-column align-items-center">
        {undoBanner && (
          <div className="container mt-2">
            <div className="alert alert-warning alert-dismissible fade show shadow d-flex align-items-center justify-content-between" role="alert">
              <div>
                <strong>↩ Sale Reversal Notice:</strong> {undoBanner}
              </div>
              <button type="button" className="btn-close" onClick={() => setUndoBanner(null)} aria-label="Close"></button>
            </div>
          </div>
        )}
        <div className="container auction-container p-1 rounded shadow-lg">

          <div className="container player-info-container shadow p-2 rounded">
            <div className="row g-4">
              <div className="col-md-3 text-center">
                <img
                  src={getImageUrl(auction.player.image_path) || fallbackImg}
                  alt={auction?.player?.name || "Player in auction"}
                  className="player-image img-fluid"
                  onError={(e) => (e.target.src = fallbackImg)}
                />
              </div>

              <div className="col-md-9">
                <div className="row g-3">
                  <div className="col-md-6 info-box green">
                    <div className="label">Player Name</div>
                    <div className="value">{auction.player.name}</div>
                  </div>

                  {/*<div className="col-md-3 info-box green">
                    <div className="label">Jersey No</div>
                    <div className="value">
                      {auction.player.jersey ?? auction.player.jersey_number}
                    </div>
                  </div>*/}

                  <div className="col-md-6 info-box red">
                    <div className="label">Role</div>
                    <div className="value">{auction.player.category}</div>
                  </div>

                  <div className="col-md-6 info-box red">
                    <div className="label">Type</div>
                    <div className="value">{auction.player.type}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* PRICE + TIMER */}
            <div className="row text-center mt-3">
              <div className="col-md-4 d-flex flex-column align-items-center">
                <div className="p-3 mb-1 rounded bg-light shadow base-price">
                  <strong>Base Price</strong>
                  <p>₹{basePrice}</p>
                </div>

                <div className="p-3 rounded-circle bg-warning shadow current-price">
                  <strong>Current Price</strong>
                  <h4>₹{currentBid}</h4>
                </div>
              </div>

              <div className="col-md-4 d-flex justify-content-center align-items-center">
                <div className="timer bg-warning text-dark p-3 rounded">
                  {formatTime(auction.timer)}
                </div>
              </div>

              {/* BIDDING BUTTONS */}
              <div className="col-md-4 d-flex flex-column align-items-center">
                <div className="quick-bids mb-1">
                  {nextSteps.map((b) => (
                    <button
                      type="button"
                      key={b}
                      className="btn btn-danger m-1 bit-btn"
                      disabled={
                        auction.paused ||
                        auction.timer <= 0
                      }
                      onClick={() => placeBid(b)}
                    >
                      ₹{b}
                    </button>
                  ))}
                </div>

                <div className="p-3 mb-1 rounded bg-light shadow base-price">
                  <p>₹{auction.teamBalance}</p>
                </div>
                <div className="p-3 mb-2 rounded bg-light shadow d-flex align-items-center">
                  <img src={user?.team_logo ? `${API_BASE_URL}/${user.team_logo}` : fallbackImg}
                    alt={user?.team_name || user?.name ? `${user?.team_name || user?.name} logo` : "Team purse logo"}
                    width="50"
                    height="50"
                    className="me-2"/>
                    <strong>{user?.team_name || user?.name || "Team"} Purse</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="notifications-container">
            <h5 className="notifications-title">Notifications</h5>

            <div className="notifications-list">
              {auction.history.length ? (
                auction.history.map((note, i) => {
                  const rankClass =
                    i === auction.history.length - 1
                      ? "gold"
                      : i === auction.history.length - 2
                        ? "silver"
                        : i === auction.history.length - 3
                          ? "bronze"
                          : "";

                  if (note.type === "undo_sale" || note.is_undo) {
                    return (
                      <p
                        key={note.id || `undo-${note.player_id}-${i}`}
                        className="undo-sale-note text-warning fw-bold py-1 px-2 my-1 rounded"
                        style={{ backgroundColor: "rgba(255, 193, 7, 0.15)", borderLeft: "4px solid #ffc107" }}
                      >
                        ↩ {formatBidTime(note.bid_time)} — {note.message}
                      </p>
                    );
                  }

                  return (
                    <p
                      key={note.id || `${note.team_name || 'team'}-${note.bid_amount || 0}-${note.bid_time || i}-${i}`}
                      className={`${flashIndex === i ? "flash" : ""
                        } ${rankClass}`}
                    >
                      🕒 {formatBidTime(note.bid_time)} — {note.team_name} bid ₹
                      {note.bid_amount}
                    </p>
                  );

                })
              ) : (
                <p>No Bids yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Auction;
