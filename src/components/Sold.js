import "./Sold.css";
import React, { useEffect } from "react";
import fallbackImg from "../assets/images/PlAyer.png";
import fallBackImage from "../assets/images/football-team_16848377.png";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../Config";
import { getImageUrl } from "../Utils/constants";

const Sold = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { player, team } = location.state || {};

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .get("/check-auth", { withCredentials: true })
        .then((res) => {
          const role = res.data.user?.role;
          if (role === "admin") navigate("/Admin_auction");
          else if (role === "team") navigate("/auction");
          else navigate("/");
        })
        .catch(() => navigate("/"));
    }, 10000);

    return () => clearTimeout(timer);
  }, [navigate]);

  useEffect(() => {
  const audio = new Audio(require("../assets/Sounds/Success/Sold brass-fanfare-reverberated-146263.mp3"));

  const timer = setTimeout(() => {
    audio.play().catch(() => {});
  }, 1500); // 1.5 sec delay

  return () => clearTimeout(timer);
}, []);


  if (!player || !team)
    return (
      <p className="text-center text-white mt-5">
        No player data available
      </p>
    );

  return (
    <div className="bg sold-page text-white py-4">
      <div className="container">
        <div className="row align-items-center justify-content-center">
          {/* Player Card */}
          <div className="col-md-5 text-center mb-4 mb-md-0">
            <div className="player-card bg-dark p-4 rounded-4 shadow-lg">
              <div className="position-relative">
                <img
                  src={getImageUrl(player.image_path) || fallbackImg}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackImg;
                  }}
                  alt={player?.name || "Sold player photo"}
                  className="img-fluid rounded-circle border border-4 border-success mb-3 player-img"
                />
                <div className="sold-stamp">SOLD</div>
              </div>

              <h2 className="fw-bold text-info">{player.name}</h2>
              <p className="mb-1">
                <strong>Category:</strong> {player.category}
              </p>
              <p className="mb-1">
                <strong>Style:</strong> {player.type}
              </p>
              <p className="mb-1">
                <strong>Base Price:</strong> ₹{player.base_price}
              </p>
            </div>
          </div>

          {/* Team Card */}
          <div className="col-md-5 text-center">
            <div className="team-card bg-dark p-4 rounded-4 shadow-lg">
              <img
                src={getImageUrl(team.image_path) || fallBackImage}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = fallBackImage;
                }}
                alt={team?.team_name || "Purchasing team logo"}
                className="img-fluid rounded-circle border border-4 border-info mb-3 team-img"
              />
              <h2 className="fw-bold text-info">{team.team_name}</h2>

              <p className="mb-1">
                <strong>Final Bid:</strong> ₹{team.bid_amount}
              </p>

              <p className="mb-1">
                <strong>Team ID:</strong> {team.team_id}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sold;
