import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AgentProfile } from "./pages/AgentProfile.js";
import { Explore } from "./pages/Explore.js";
import { ForAgents } from "./pages/ForAgents.js";
import { Home } from "./pages/Home.js";
import { IssueAgent } from "./pages/IssueAgent.js";
import { ManageAgent } from "./pages/ManageAgent.js";
import { MyAgents } from "./pages/MyAgents.js";
import { Skills } from "./pages/Skills.js";
import { Deploy } from "./pages/Deploy.js";
import { DeployDashboard } from "./pages/DeployDashboard.js";
import { MyDeployments } from "./pages/MyDeployments.js";
import { Verify } from "./pages/Verify.js";
import { Stats } from "./pages/Stats.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/issue" element={<IssueAgent />} />
        <Route path="/agents" element={<MyAgents />} />
        <Route path="/manage" element={<ManageAgent />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/explore/agent/:address" element={<AgentProfile />} />
        <Route path="/for-agents" element={<ForAgents />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/deployments" element={<MyDeployments />} />
        <Route path="/dashboard/:id" element={<DeployDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
