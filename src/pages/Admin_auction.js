import NavbarComponent from "../components/Navbar";
import "./Admin_auction.css";
import fallbackImg from "../assets/images/PlAyer.png";
import { useEffect, useState, useRef, useCallback, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../../src/socket";
import useSyncedTimer from "../hooks/useSyncedTimer";
import { api } from "../Config";
import { getImageUrl } from "../Utils/constants";

// Single socket instance (hook-like)


const startAuction = async () => {
  try {
    await api.post(
      "/start-auction",
      { mode: "random" },
      { withCredentials: true }
    );
  } catch (err) {
    console.error(err);
    alert("Failed to start auction");
  }
};

const markPlayerAsSold = async (id) => {
  try {
    const res = await api.post(
      "/mark-sold",
      { player_id: id },
      { withCredentials: true }
    );
    alert(res.data.message);
  } catch (err) {
    alert(err.response?.data?.error || "Failed to mark SOLD");
  }
};


const handlePause = async () => {
  try {
    await api.post("/pause-auction", {}, { withCredentials: true });
  } catch (err) {
    console.error("Pause failed:", err);
    alert(err.response?.data?.detail || err.response?.data?.error || "Failed to pause auction");
  }
};

const handleResume = async () => {
  try {
    await api.post("/resume-auction", {}, { withCredentials: true });
  } catch (err) {
    console.error("Resume failed:", err);
    alert(err.response?.data?.detail || err.response?.data?.error || "Failed to resume auction");
  }
};

const handleUndoSale = async () => {
  if (!window.confirm("Are you sure you want to undo the last player sale?")) return;
  try {
    const res = await api.post("/undo-sale", {}, { withCredentials: true });
    alert(res.data.message || "Player sale undone successfully!");
  } catch (err) {
    alert(err.response?.data?.detail || err.response?.data?.error || "Failed to undo sale");
  }
};

const handleRestartPlayer = async (playerId) => {
  if (!window.confirm("Do you want to re-auction this player now?")) return;

  try {
    const res = await api.post(
      "/restart-player",
      { player_id: playerId, duration: 120 },
      { withCredentials: true }
    );
    alert(res.data.message || "Auction restarted successfully!");
  } catch (err) {
    alert(err.response?.data?.detail || err.response?.data?.error || "Failed to restart auction");
  }
};

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

const adminAuctionReducer = (state, action) => {
  switch (action.type) {
    case "STATE":
      return {
        ...state,
        player: null,
        history: [],
        currentBid: 0,
        timer: 0,
        paused: false,
        active: false,
        loading: false
      };
    case "STATUS":
      return {
        ...state,
        player: action.player,
        history: Array.isArray(action.history) ? action.history : state.history,
        currentBid: action.currentBid,
        timer: action.timer ?? state.timer,
        paused: Boolean(action.paused),
        active: true,
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
        active: true,
        loading: false
      };
    case "UPDATE":
      return {
        ...state,
        currentBid: action.currentBid ?? state.currentBid,
        history: Array.isArray(action.history) ? action.history : state.history
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
    case "TIMER_SYNC":
      return {
        ...state,
        timer: typeof action.timer === "function" ? action.timer(state.timer) : action.timer
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

const Admin_auction = () => {
  const [undoBanner, setUndoBanner] = useState(null);
  const [auction, dispatch] = useReducer(adminAuctionReducer, {

    player: null,
    history: [],
    currentBid: 0,
    timer: 0,
    paused: false,
    active: false,
    loading: true
  });
  const [flashIndex, setFlashIndex] = useState(null);
  const audioRef = useRef(null);
  if (audioRef.current === null) {
    audioRef.current = new Audio(require("../assets/Sounds/mixkit-software-interface-start-2574.wav"));
  }
  const navigate = useNavigate();

  // Keeps timer in sync with server events via stable callback
  const handleTimerSync = useCallback((t) => {
    dispatch({ type: "TIMER_SYNC", timer: t });
  }, []);

  useSyncedTimer(socket, handleTimerSync);

  // Authentication + socket listeners
  useEffect(() => {
    const joinAuction = () => {
      console.log("Joining auction room...");
      socket.emit("admin_join");
      socket.emit("join_auction");
    };

    const handleAuctionState = (data) => {
      console.log("auction_state:", data);
      if (data.status === "no_active_auction") {
        dispatch({ type: "STATE" });
      }
    };

    const handleAuctionStatus = (data) => {
      console.log("auction_status:", data);
      const base = Number(data.player.base_price);
      const current = data.highest_bid?.bid_amount || base;
      dispatch({
        type: "STATUS",
        player: data.player,
        currentBid: current,
        history: data.history || [],
        timer: data.remaining_seconds,
        paused: Boolean(data.paused)
      });
    };


    const handleAuctionStarted = (data) => {
      console.log("auction_started:", data);
      dispatch({
        type: "STARTED",
        player: data.player,
        currentBid: data.current_bid || data.player?.base_price || 0,
        timer: data.duration
      });
    };

    const handleAuctionUpdate = (data) => {
      dispatch({
        type: "UPDATE",
        currentBid: data.current_bid,
        history: data.history
      });
    };

    const handleAuctionPaused = (data) => {
      dispatch({
        type: "PAUSE",
        timer: data.remaining_seconds
      });
    };

    const handleAuctionResumed = (data) => {
      dispatch({
        type: "RESUME",
        timer: data.remaining_seconds
      });
    };

    const handleAuctionEnded = (data) => {
      console.log("auction_ended:", data);
      if (data.status === "sold") {
        navigate("/sold", { state: data });
      } else {
        navigate("/unsold", { state: data });
      }
    };

    const handleUndoSaleEvent = (data) => {
      console.log("undo_sale event on admin:", data);
      const msg = data.message || `Sale of ${data.player_name || data.player?.name || "Player"} was reversed.`;
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
    };

    if (socket.connected) {
      joinAuction();
    } else {
      socket.on("connect", joinAuction);
    }

    // No auction running
    socket.on("auction_state", handleAuctionState);

    // Auction already running
    socket.on("auction_status", handleAuctionStatus);

    // Auction started
    socket.on("auction_started", handleAuctionStarted);

    // Bid update
    socket.on("auction_update", handleAuctionUpdate);

    // Pause
    socket.on("auction_paused", handleAuctionPaused);

    // Resume
    socket.on("auction_resumed", handleAuctionResumed);

    // Auction ended
    socket.on("auction_ended", handleAuctionEnded);

    // Undo sale
    socket.on("undo_sale", handleUndoSaleEvent);

    socket.onAny((event, data) => {
      console.log("Socket event:", event, data);
    });

    return () => {
      socket.off("connect", joinAuction);
      socket.off("auction_state", handleAuctionState);
      socket.off("auction_status", handleAuctionStatus);
      socket.off("auction_started", handleAuctionStarted);
      socket.off("auction_update", handleAuctionUpdate);
      socket.off("auction_paused", handleAuctionPaused);
      socket.off("auction_resumed", handleAuctionResumed);
      socket.off("auction_ended", handleAuctionEnded);
      socket.off("undo_sale", handleUndoSaleEvent);
    };


  }, [navigate]);

  useEffect(() => {
    const el = document.querySelector(".notifications-list");
    if (el) el.scrollTop = el.scrollHeight;
  }, [auction.history]);

  // Admin actions


  const nextPlayer = async () => {

    if (auction.paused) return;

    try {

      await api.post(
        "/next-auction",
        {},
        { withCredentials: true }
      );

    } catch (err) {

      console.error(err);
      alert("Failed to move to next player");

    }

  };



  const handleCancel = useCallback(async () => {
    try {
      await api.post(
        "/cancel-auction",
        {},
        { withCredentials: true }
      );

      dispatch({ type: "STATE" });
    } catch (err) {
      console.error("Cancel failed:", err);
      alert("Cancel failed");
    }
  }, []);


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
  const player = auction.player;

  if (auction.loading) {
    return (
      <>
        <NavbarComponent />
        <div className="text-center mt-5">
          <h5>Connecting to auction server...</h5>
        </div>
      </>
    );
  }

  return (
    <>
      <NavbarComponent />

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
        <div className="container auction-container mt-1 p-3 rounded shadow-lg">

          {player ? (
            <>
              <div className="container player-info-container shadow p-3 rounded">
                <div className="row g-4">
                  {/* PLAYER IMAGE */}
                  <div className="col-md-3 text-center">
                    <img
                      src={getImageUrl(player.image_path) || fallbackImg}
                      alt={player?.name || "Player in auction"}
                      className="player-image img-fluid"
                      onError={(e) => (e.target.src = fallbackImg)}
                    />
                  </div>

                  {/* PLAYER DETAILS */}
                  <div className="col-md-9">
                    <div className="row g-3">
                      <div className="col-md-6 info-box green">
                        <div className="label">Player Name</div>
                        <div className="value">{player.name}</div>
                      </div>

                      {/*<div className="col-md-3 info-box green">
                        <div className="label">Jersey No</div>
                        <div className="value">{player.jersey}</div>
                      </div>*/}

                      <div className="col-md-6 info-box red">
                        <div className="label">Player Category</div>
                        <div className="value">{player.category}</div>
                      </div>

                      <div className="col-md-6 info-box red">
                        <div className="label">Style</div>
                        <div className="value">{player.type}</div>
                      </div>

                      {/*<div className="col-md-3 stat-box orange">
                        <div className="label">Highest Runs</div>
                        <div className="value">{player.highest_runs}</div>
                      </div>*/}
                    </div>
                  </div>
                </div>

                {/* PRICE + TIMER + CONTROLS */}
                <div className="row text-center mt-2">
                  <div className="col-md-4 d-flex align-items-center">
                    <div className="p-3 mb-1 rounded bg-light shadow base-price">
                      <strong>Base Price</strong>
                      <p>₹{player.base_price}</p>
                    </div>

                    <div className="p-2 ms-3 mb-1 rounded-circle bg-warning shadow current-price">
                      <strong>Current Price</strong>
                      <h4>₹{auction.currentBid || auction.player?.base_price}</h4>
                    </div>
                  </div>

                  <div className="col-md-4 d-flex justify-content-center align-items-center">
                    <div className="timer bg-warning text-dark p-3 rounded">
                      {formatTime(auction.timer)}
                    </div>
                  </div>

                  <div className="col-md-4 d-flex flex-column align-items-center">
                    <div className="quick-bids mb-3">
                      <button
                        type="button"
                        className="btn btn-danger m-2"
                        // disabled={!auction.highestBid}
                        onClick={() => markPlayerAsSold(player.id)}
                      >
                        Sold
                      </button>

                      <button
                        type="button"
                        className="btn btn-warning m-2"
                        onClick={handlePause}
                        disabled={auction.paused || !auction.active}
                      >
                        Pause
                      </button>
                      <button
                        type="button"
                        className="btn btn-success m-2"
                        onClick={handleResume}
                        disabled={!auction.paused}
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        className="btn btn-dark m-2"
                        onClick={handleCancel}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary m-2"
                        onClick={handleUndoSale}
                      >
                        Undo Sale
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary m-2"
                        onClick={nextPlayer}
                        disabled={auction.paused || !auction.active}
                      >
                        Next Player
                      </button>
                      <button
                        className="btn btn-warning btn-sm m-1"
                        onClick={() => handleRestartPlayer(player.id)}
                      >
                        Re-Auction Player
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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
            </>
          ) : (
            <div className="text-center">
              <p>No Player Found or Auction Not Started</p>


              <button type="button" className="btn btn-success mt-3" onClick={startAuction}>
                Start Auction
              </button>

            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Admin_auction;
