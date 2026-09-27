import "./Unsold.css";
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import fallbackImg from "../assets/images/PlAyer.png";
import { api } from "../Config";
import { getImageUrl } from "../Utils/constants";


const Unsold = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const playerId =
    location.state?.player?.id ||
    location.state?.player_id;

  const [player, setPlayer] = useState(location.state?.player || null);
  const [basePrice, setBasePrice] = useState(location.state?.base_price || null);

  // 🧠 If player data missing (e.g. page reloaded), fetch it by ID
  useEffect(() => {
    let ignore = false;
    if (!playerId) return;

    const loadPlayer = async () => {
      try {
        const res = await api.get(
          `/players/${playerId}`,
          { withCredentials: true }
        );

        if (res.data && !ignore) {
          setPlayer(res.data);
          setBasePrice(res.data.base_price);
        }
      } catch (err) {
        console.error("Failed to fetch player info:", err);
      }
    };

    if (!player) {
      loadPlayer();
    }

    return () => {
      ignore = true;
    };
  }, [player, playerId]);

  // 🕒 Auto return to auction after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      // Ask backend who this user is
      api
        .get("/check-auth", { withCredentials: true })
        .then((res) => {
          const role = res.data.user?.role;
          if (role === "admin") {
            navigate("/Admin_auction");
          } else if (role === "team") {
            navigate("/waiting");
          } else {
            navigate("/");
          }
        })
        .catch(() => navigate("/"));
    }, 10000)

    return () => clearTimeout(timer);
  }, [navigate]);

  useEffect(() => {
    const audio = new Audio(require("../assets/Sounds/Fail/fail-234710.mp3"));

    const timer = setTimeout(() => {
      audio.play().catch(() => { });
    }, 1500);

    return () => clearTimeout(timer);
  }, []);


  // 🧩 If still no player info
  if (!player) {
    return (
      <div className="bg text-white text-center py-5">
        <h2>No player data available</h2>
        <button
          type="button"
          className="btn btn-light mt-3"
          onClick={() => navigate("/Admin_auction")}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg">
      <div className="unsold-page container text-white py-4">
        <div className="row align-items-center">
          {/* Player Image */}
          <div className="col-md-4 text-center">
            <div className="unsold-img-wrapper">
              <img
                src={getImageUrl(player.image_path) || fallbackImg}
                alt={player?.name || "Unsold player photo"}
                className="img-fluid rounded-circle border border-4"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = fallbackImg;
                }}
              />
              <div className="unsold-stamp">UNSOLD</div>
            </div>
          </div>

          {/* Player Details */}
          <div className="col-md-8 text-center text-md-start">
            <h1 className="player-name">{player.name}</h1>

            <div className="price-info d-flex flex-column flex-md-row gap-3">
              <div className="price-box bg-dark text-warning p-3 rounded">
                <strong>Base Price:</strong> ₹{basePrice ?? player.base_price}
              </div>
              <div className="price-box bg-dark text-danger p-3 rounded">
                <strong>Status:</strong> UNSOLD
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Unsold;
